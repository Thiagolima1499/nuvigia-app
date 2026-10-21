import type { CameraRow, CloudProviderId, EventRow, RecordingRow, SettingsRow } from '@nuvigia/shared';
import type { SupabaseClient } from '@supabase/supabase-js';

export type NewCamera = Pick<CameraRow, 'name' | 'room' | 'model' | 'ip' | 'upload_to_cloud' | 'supports_talk'> & Partial<Pick<CameraRow, 'online' | 'record_mode'>>;
export type CameraPatch = Partial<Pick<CameraRow, 'online' | 'recording' | 'rec_started_at' | 'model' | 'ip' | 'supports_talk'>>;
export type NewRecording = Pick<RecordingRow, 'camera_id' | 'started_at' | 'kind' | 'status'> & Partial<Pick<RecordingRow, 'id' | 'duration_sec' | 'provider' | 'thumbnail_path' | 'upload_progress'>>;
export type RecordingPatch = Partial<Pick<RecordingRow, 'duration_sec' | 'status' | 'provider' | 'cloud_file_ref' | 'upload_progress' | 'error' | 'thumbnail_path'>>;
export type NewEvent = Pick<EventRow, 'camera_id' | 'type'> & Partial<Pick<EventRow, 'recording_id' | 'thumbnail_path' | 'at'>>;
export type CloudPatch = Partial<Pick<SettingsRow, 'cloud_provider' | 'cloud_connected' | 'cloud_account' | 'cloud_used_bytes' | 'cloud_total_bytes' | 'cloud_folder_ref'>>;

/**
 * Tudo que o hub faz no Supabase passa por aqui. A RLS garante que o hub só
 * enxerga e escreve linhas com o próprio hub_id; o owner_id é preenchido por gatilho.
 */
export interface Backend {
  readonly hubId: string;
  getOwnerId(): Promise<string | null>;
  /** Endereço do túnel (ou null), para o app saber se há plano B por HLS. */
  setPublicUrl(url: string | null): Promise<void>;
  createPairingCode(): Promise<{ code: string; expiresAt: string }>;
  heartbeat(version: string): Promise<void>;
  listCameras(): Promise<CameraRow[]>;
  insertCamera(c: NewCamera): Promise<CameraRow>;
  updateCamera(id: string, patch: CameraPatch): Promise<void>;
  deleteCamera(id: string): Promise<void>;
  insertRecording(r: NewRecording): Promise<RecordingRow>;
  updateRecording(id: string, patch: RecordingPatch): Promise<void>;
  getRecording(id: string): Promise<RecordingRow | null>;
  deleteRecording(id: string): Promise<void>;
  /** Gravações já na nuvem com início antes de `before` (retenção). */
  listCloudRecordingsBefore(before: string, limit: number): Promise<Pick<RecordingRow, 'id' | 'cloud_file_ref' | 'provider' | 'started_at'>[]>;
  insertEvent(e: NewEvent): Promise<void>;
  getSettings(): Promise<SettingsRow | null>;
  updateCloud(patch: CloudPatch): Promise<void>;
  uploadThumbnail(name: string, jpeg: Buffer): Promise<string>;
  removeThumbnails(paths: string[]): Promise<void>;
}

/** O dono desvinculou o hub no app (a linha em `hubs` foi apagada). */
export class HubRemovedError extends Error {
  constructor() {
    super('hub_removed');
  }
}

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  const data = check(res, what);
  if (data == null) throw new Error(`${what}: resposta vazia`);
  return data;
}

export class SupabaseBackend implements Backend {
  constructor(
    private readonly sb: SupabaseClient,
    readonly hubId: string,
  ) {}

  async getOwnerId() {
    const row = check(await this.sb.from('hubs').select('owner_id').eq('id', this.hubId).maybeSingle<{ owner_id: string | null }>(), 'ler hub');
    if (!row) throw new HubRemovedError();
    return row.owner_id;
  }

  async setPublicUrl(url: string | null) {
    check(await this.sb.from('hubs').update({ public_url: url }).eq('id', this.hubId), 'salvar endereço público');
  }

  async createPairingCode() {
    const rows = check(await this.sb.rpc('create_pairing_code'), 'gerar código') as { code: string; expires_at: string }[];
    const first = rows[0];
    if (!first) throw new Error('gerar código: resposta vazia');
    return { code: first.code, expiresAt: first.expires_at };
  }

  async heartbeat(version: string) {
    check(await this.sb.rpc('hub_heartbeat', { p_version: version }), 'heartbeat');
  }

  async listCameras() {
    return check(await this.sb.from('cameras').select('*').eq('hub_id', this.hubId).order('created_at'), 'listar câmeras') as CameraRow[];
  }

  async insertCamera(c: NewCamera) {
    return must(await this.sb.from('cameras').insert({ ...c, hub_id: this.hubId }).select('*').single<CameraRow>(), 'criar câmera');
  }

  async updateCamera(id: string, patch: CameraPatch) {
    check(await this.sb.from('cameras').update(patch).eq('id', id), 'atualizar câmera');
  }

  async deleteCamera(id: string) {
    check(await this.sb.from('cameras').delete().eq('id', id), 'apagar câmera');
  }

  async insertRecording(r: NewRecording) {
    return must(await this.sb.from('recordings').insert({ ...r, hub_id: this.hubId }).select('*').single<RecordingRow>(), 'criar gravação');
  }

  async updateRecording(id: string, patch: RecordingPatch) {
    check(await this.sb.from('recordings').update(patch).eq('id', id), 'atualizar gravação');
  }

  async getRecording(id: string) {
    return check(await this.sb.from('recordings').select('*').eq('id', id).maybeSingle<RecordingRow>(), 'ler gravação');
  }

  async deleteRecording(id: string) {
    check(await this.sb.from('recordings').delete().eq('id', id), 'apagar gravação');
  }

  async listCloudRecordingsBefore(before: string, limit: number) {
    return check(
      await this.sb.from('recordings').select('id, cloud_file_ref, provider, started_at').eq('hub_id', this.hubId).not('cloud_file_ref', 'is', null).lt('started_at', before).order('started_at').limit(limit),
      'listar gravações antigas',
    ) as Pick<RecordingRow, 'id' | 'cloud_file_ref' | 'provider' | 'started_at'>[];
  }

  async insertEvent(e: NewEvent) {
    check(await this.sb.from('events').insert({ ...e, hub_id: this.hubId }), 'registrar evento');
  }

  async getSettings() {
    return check(await this.sb.from('settings').select('*').eq('hub_id', this.hubId).maybeSingle<SettingsRow>(), 'ler ajustes');
  }

  async updateCloud(patch: CloudPatch) {
    check(await this.sb.from('settings').update(patch).eq('hub_id', this.hubId), 'atualizar nuvem');
  }

  async uploadThumbnail(name: string, jpeg: Buffer) {
    const path = `${this.hubId}/${name}`;
    check(await this.sb.storage.from('thumbnails').upload(path, jpeg, { contentType: 'image/jpeg', upsert: true }), 'enviar miniatura');
    return path;
  }

  async removeThumbnails(paths: string[]) {
    if (paths.length) check(await this.sb.storage.from('thumbnails').remove(paths), 'apagar miniaturas');
  }
}

export type { CloudProviderId };
