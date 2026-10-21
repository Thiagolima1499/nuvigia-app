import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { CloudProviderId } from '@nuvigia/shared';

import type { Secrets } from './crypto';

/** Credenciais do Supabase que o hub recebeu no registro. */
export type HubIdentity = { hubId: string; email: string; password: string };

/** Dados sensíveis de uma câmera: ficam só aqui, cifrados. */
export type CameraSecret = {
  rtspUrl: string;
  username?: string;
  password?: string;
  /** Endereço ONVIF (para trocar de perfil de qualidade e ouvir eventos). */
  onvif?: { hostname: string; port: number };
  profileToken?: string;
};

export type LocalFileStatus = 'pending' | 'uploading' | 'done' | 'failed' | 'local';

export type LocalFile = {
  recordingId: string;
  cameraId: string;
  path: string;
  kind: 'video' | 'photo';
  startedAt: string;
  durationSec: number;
  status: LocalFileStatus;
  attempts: number;
  nextAttemptAt: string | null;
  lastError: string | null;
  uploadedAt: string | null;
};

type FileRow = {
  recording_id: string;
  camera_id: string;
  path: string;
  kind: 'video' | 'photo';
  started_at: string;
  duration_sec: number;
  status: LocalFileStatus;
  attempts: number;
  next_attempt_at: string | null;
  last_error: string | null;
  uploaded_at: string | null;
};

const fromRow = (r: FileRow): LocalFile => ({
  recordingId: r.recording_id,
  cameraId: r.camera_id,
  path: r.path,
  kind: r.kind,
  startedAt: r.started_at,
  durationSec: r.duration_sec,
  status: r.status,
  attempts: r.attempts,
  nextAttemptAt: r.next_attempt_at,
  lastError: r.last_error,
  uploadedAt: r.uploaded_at,
});

/**
 * Banco local do hub (SQLite embutido no Node). Tudo que é segredo passa por
 * `Secrets` antes de chegar ao disco; o AAD amarra cada valor à sua linha.
 */
export class LocalStore {
  private db: DatabaseSync;

  constructor(
    path: string,
    private readonly secrets: Secrets,
  ) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      pragma journal_mode = wal;
      create table if not exists kv (key text primary key, value text not null);
      create table if not exists camera_secrets (camera_id text primary key, data text not null);
      create table if not exists cloud_tokens (provider text primary key, data text not null);
      create table if not exists local_files (
        recording_id text primary key,
        camera_id text not null,
        path text not null,
        kind text not null,
        started_at text not null,
        duration_sec integer not null default 0,
        status text not null default 'pending',
        attempts integer not null default 0,
        next_attempt_at text,
        last_error text,
        uploaded_at text
      );
      create index if not exists local_files_status on local_files (status, next_attempt_at);
    `);
  }

  close() {
    this.db.close();
  }

  // ---------------------------------------------------------------- identidade
  getIdentity(): HubIdentity | null {
    const row = this.db.prepare('select value from kv where key = ?').get('identity') as { value: string } | undefined;
    return row ? this.secrets.decryptJson<HubIdentity>(row.value, 'identity') : null;
  }

  setIdentity(id: HubIdentity) {
    this.db.prepare('insert into kv (key, value) values (?, ?) on conflict (key) do update set value = excluded.value').run('identity', this.secrets.encryptJson(id, 'identity'));
  }

  clearIdentity() {
    this.db.prepare('delete from kv where key = ?').run('identity');
  }

  // ------------------------------------------------------------------ câmeras
  getCameraSecret(cameraId: string): CameraSecret | null {
    const row = this.db.prepare('select data from camera_secrets where camera_id = ?').get(cameraId) as { data: string } | undefined;
    return row ? this.secrets.decryptJson<CameraSecret>(row.data, `camera:${cameraId}`) : null;
  }

  setCameraSecret(cameraId: string, secret: CameraSecret) {
    this.db
      .prepare('insert into camera_secrets (camera_id, data) values (?, ?) on conflict (camera_id) do update set data = excluded.data')
      .run(cameraId, this.secrets.encryptJson(secret, `camera:${cameraId}`));
  }

  deleteCameraSecret(cameraId: string) {
    this.db.prepare('delete from camera_secrets where camera_id = ?').run(cameraId);
  }

  cameraIds(): string[] {
    return (this.db.prepare('select camera_id from camera_secrets').all() as { camera_id: string }[]).map((r) => r.camera_id);
  }

  // ------------------------------------------------------------- tokens nuvem
  getCloudToken<T>(provider: CloudProviderId): T | null {
    const row = this.db.prepare('select data from cloud_tokens where provider = ?').get(provider) as { data: string } | undefined;
    return row ? this.secrets.decryptJson<T>(row.data, `cloud:${provider}`) : null;
  }

  setCloudToken(provider: CloudProviderId, token: unknown) {
    this.db
      .prepare('insert into cloud_tokens (provider, data) values (?, ?) on conflict (provider) do update set data = excluded.data')
      .run(provider, this.secrets.encryptJson(token, `cloud:${provider}`));
  }

  deleteCloudTokens() {
    this.db.exec('delete from cloud_tokens');
  }

  // ----------------------------------------------------------- arquivos locais
  addFile(f: Pick<LocalFile, 'recordingId' | 'cameraId' | 'path' | 'kind' | 'startedAt' | 'durationSec' | 'status'>) {
    this.db
      .prepare('insert into local_files (recording_id, camera_id, path, kind, started_at, duration_sec, status) values (?, ?, ?, ?, ?, ?, ?)')
      .run(f.recordingId, f.cameraId, f.path, f.kind, f.startedAt, f.durationSec, f.status);
  }

  getFile(recordingId: string): LocalFile | null {
    const row = this.db.prepare('select * from local_files where recording_id = ?').get(recordingId) as FileRow | undefined;
    return row ? fromRow(row) : null;
  }

  /** Próximos arquivos prontos para envio (pendentes ou com nova tentativa vencida). */
  nextUploads(now: Date, limit = 5): LocalFile[] {
    const rows = this.db
      .prepare(
        `select * from local_files
         where status = 'pending' and (next_attempt_at is null or next_attempt_at <= ?)
         order by started_at limit ?`,
      )
      .all(now.toISOString(), limit) as FileRow[];
    return rows.map(fromRow);
  }

  updateFile(recordingId: string, patch: Partial<Pick<LocalFile, 'status' | 'attempts' | 'nextAttemptAt' | 'lastError' | 'uploadedAt' | 'durationSec'>>) {
    const map: Record<string, string> = {
      status: 'status',
      attempts: 'attempts',
      nextAttemptAt: 'next_attempt_at',
      lastError: 'last_error',
      uploadedAt: 'uploaded_at',
      durationSec: 'duration_sec',
    };
    const keys = Object.keys(patch).filter((k) => k in map) as (keyof typeof patch)[];
    if (keys.length === 0) return;
    const sets = keys.map((k) => `${map[k]} = ?`).join(', ');
    const values = keys.map((k) => (patch[k] ?? null) as string | number | null);
    this.db.prepare(`update local_files set ${sets} where recording_id = ?`).run(...values, recordingId);
  }

  deleteFile(recordingId: string) {
    this.db.prepare('delete from local_files where recording_id = ?').run(recordingId);
  }

  filesForCamera(cameraId: string): LocalFile[] {
    return (this.db.prepare('select * from local_files where camera_id = ?').all(cameraId) as FileRow[]).map(fromRow);
  }

  /** Arquivos que podem sair do disco: enviados há mais de N dias, ou locais mais velhos que a retenção. */
  expiredFiles(uploadedBefore: Date, localBefore: Date | null): LocalFile[] {
    const rows = this.db
      .prepare(
        `select * from local_files
         where (status = 'done' and uploaded_at <= ?)
            or (? is not null and status in ('local', 'failed') and started_at <= ?)`,
      )
      .all(uploadedBefore.toISOString(), localBefore?.toISOString() ?? null, localBefore?.toISOString() ?? null) as FileRow[];
    return rows.map(fromRow);
  }
}
