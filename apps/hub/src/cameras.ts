import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { cameraFromRow, type Camera, type CameraRow, type HubCommand, type HubEvent, type Quality, type RecordMode, type SettingsRow } from '@nuvigia/shared';
import type { Logger } from 'pino';

import type { Backend } from './backend';
import type { CloudControl } from './cloud';
import type { Config } from './config';
import type { Go2rtc } from './go2rtc';
import { MotionDetector } from './motion';
import { rtspTarget, tcpReachable } from './net';
import { CameraAuthError, QUALITY_HEIGHT, redact, withCredentials, type OnvifService } from './onvif';
import type { Spawn } from './proc';
import { Recorder, recordingPath } from './recorder';
import type { CameraSecret, LocalStore } from './store';

export type AddCamera = Extract<HubCommand, { type: 'addCamera' }>;

/** Portas ONVIF mais comuns (80 padrão, 2020 Tapo, 8000/8899 genéricas). */
const ONVIF_PORTS = [80, 2020, 8000, 8899];
const HEALTH_MS = 30_000;

type Runtime = {
  row: CameraRow;
  secret: CameraSecret;
  recorder: Recorder;
  motion: MotionDetector | null;
  onvifEvents: { close: () => void } | null;
  online: boolean;
  manual: boolean;
};

export type CameraDeps = {
  cfg: Pick<Config, 'FFMPEG_PATH' | 'DATA_DIR' | 'SEGMENT_SECONDS' | 'MOTION_CLIP_SECONDS' | 'MOTION_SENSITIVITY' | 'MAX_MANUAL_SECONDS'>;
  backend: Backend;
  store: LocalStore;
  go2rtc: Go2rtc;
  onvif: OnvifService;
  cloud: CloudControl;
  spawn: Spawn;
  log: Logger;
  emit: (e: HubEvent) => void;
  reachable?: (host: string, port: number) => Promise<boolean>;
};

export class HubError extends Error {}

/**
 * Cuida das câmeras do hub: stream no go2rtc, saúde, gravação (manual, contínua
 * e por movimento), fotos e eventos.
 */
export class CameraManager {
  private cams = new Map<string, Runtime>();
  private mode: RecordMode = 'motion';
  private quality: Quality = '1080p';
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private stopping = false;

  constructor(private readonly d: CameraDeps) {}

  get recordMode() {
    return this.mode;
  }

  list(): Camera[] {
    return [...this.cams.values()].map((r) => cameraFromRow(r.row));
  }

  has(id: string) {
    return this.cams.has(id);
  }

  isOnline(id: string) {
    return this.cams.get(id)?.online ?? false;
  }

  supportsTalk(id: string) {
    return this.cams.get(id)?.row.supports_talk ?? false;
  }

  knownIps(): Set<string> {
    return new Set([...this.cams.values()].map((r) => r.row.ip).filter(Boolean));
  }

  private get recordingsDir() {
    return join(this.d.cfg.DATA_DIR, 'recordings');
  }

  /** Carrega as câmeras do Supabase e liga cada uma. */
  async start(settings: SettingsRow | null) {
    if (settings) {
      this.mode = settings.record_mode;
      this.quality = settings.quality;
    }
    const rows = await this.d.backend.listCameras();
    for (const row of rows) {
      const secret = this.d.store.getCameraSecret(row.id);
      if (!secret) {
        this.d.log.warn({ cameraId: row.id }, 'câmera sem credenciais locais (adicione de novo pelo app)');
        await this.d.backend.updateCamera(row.id, { online: false, recording: false, rec_started_at: null }).catch(() => undefined);
        continue;
      }
      await this.attach(row, secret).catch((err) => this.d.log.warn({ err, cameraId: row.id }, 'falha ao ligar câmera'));
    }
    // limpa segredos de câmeras apagadas enquanto o hub estava desligado
    for (const id of this.d.store.cameraIds()) if (!rows.some((r) => r.id === id)) this.d.store.deleteCameraSecret(id);
    this.healthTimer = setInterval(() => void this.checkHealth(), HEALTH_MS);
    void this.checkHealth();
  }

  async stop() {
    this.stopping = true;
    if (this.healthTimer) clearInterval(this.healthTimer);
    await Promise.all([...this.cams.keys()].map((id) => this.detach(id)));
  }

  private async attach(row: CameraRow, secret: CameraSecret) {
    await this.d.go2rtc.addStream(row.id, secret.rtspUrl);
    const src = this.d.go2rtc.localRtsp(row.id);
    const recorder = new Recorder(row.id, src, {
      backend: this.d.backend,
      store: this.d.store,
      spawn: this.d.spawn,
      ffmpeg: this.d.cfg.FFMPEG_PATH,
      dir: this.recordingsDir,
      log: this.d.log,
      shouldUpload: () => this.d.cloud.isConnected() && (this.cams.get(row.id)?.row.upload_to_cloud ?? row.upload_to_cloud),
      onFileReady: (id) => this.d.cloud.notifyFileReady(id),
      // no modo contínuo, quando um segmento termina começa o próximo
      onFinished: (_reason, ok) => setTimeout(() => void this.nextSegment(row.id), ok ? 500 : 30_000),
    });
    const rt: Runtime = { row, secret, recorder, motion: null, onvifEvents: null, online: row.online, manual: false };
    this.cams.set(row.id, rt);

    const motion = new MotionDetector(src, this.d.spawn, this.d.cfg.FFMPEG_PATH, this.d.cfg.MOTION_SENSITIVITY, this.d.cfg.MOTION_CLIP_SECONDS * 1000);
    motion.on('motion', () => void this.onMotion(row.id));
    rt.motion = motion;
    if (secret.onvif) {
      this.d.onvif
        .watchMotion({ ...secret.onvif, username: secret.username, password: secret.password })
        .then((w) => {
          w.events.on('motion', () => void this.onMotion(row.id));
          rt.onvifEvents = w;
        })
        .catch(() => undefined);
    }
    this.applyMode(rt);
  }

  private async detach(id: string) {
    const rt = this.cams.get(id);
    if (!rt) return;
    this.cams.delete(id);
    rt.motion?.stop();
    rt.onvifEvents?.close();
    await rt.recorder.stop();
    await this.d.go2rtc.removeStream(id).catch(() => undefined);
  }

  /** Liga/desliga detector e gravação contínua conforme o modo. */
  private applyMode(rt: Runtime) {
    if (this.mode === 'continuous') {
      rt.motion?.stop();
      if (!rt.recorder.current) void this.nextSegment(rt.row.id);
    } else {
      rt.motion?.start();
      if (rt.recorder.current?.reason === 'continuous') void rt.recorder.stop();
    }
  }

  private async nextSegment(id: string) {
    const rt = this.cams.get(id);
    if (!rt || this.stopping || this.mode !== 'continuous' || !rt.online || rt.recorder.current) return;
    try {
      await rt.recorder.start('continuous', this.d.cfg.SEGMENT_SECONDS);
    } catch (err) {
      this.d.log.warn({ err, cameraId: id }, 'gravação contínua: falha, tentando de novo em 30 s');
      setTimeout(() => void this.nextSegment(id), 30_000);
    }
  }

  private get(id: string): Runtime {
    const rt = this.cams.get(id);
    if (!rt) throw new HubError('camera_not_found');
    return rt;
  }

  // ------------------------------------------------------------------ comandos
  async startManual(id: string): Promise<{ recordingId: string }> {
    const rt = this.get(id);
    if (!rt.online) throw new HubError('camera_offline');
    // no modo contínuo, "Gravar" fecha o segmento atual e abre um manual
    if (rt.recorder.current?.reason === 'continuous') await rt.recorder.stop();
    rt.manual = true;
    const recordingId = await rt.recorder.start('manual', this.d.cfg.MAX_MANUAL_SECONDS);
    return { recordingId };
  }

  async stopManual(id: string): Promise<{ recordingId: string | null }> {
    const rt = this.get(id);
    rt.manual = false;
    const recordingId = await rt.recorder.stop();
    return { recordingId };
  }

  /** Foto agora: vira uma "gravação" do tipo foto e sobe para a nuvem como os vídeos. */
  async snapshot(id: string): Promise<{ recordingId: string }> {
    const rt = this.get(id);
    const jpeg = await this.d.go2rtc.snapshot(id).catch(() => {
      throw new HubError('camera_unreachable');
    });
    const recordingId = randomUUID();
    const now = new Date();
    const path = recordingPath(this.recordingsDir, id, now, recordingId, 'jpg');
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, jpeg);
    const thumb = await this.d.backend.uploadThumbnail(`${recordingId}.jpg`, jpeg).catch(() => null);
    const upload = this.d.cloud.isConnected() && rt.row.upload_to_cloud;
    await this.d.backend.insertRecording({
      id: recordingId,
      camera_id: id,
      started_at: now.toISOString(),
      kind: 'photo',
      status: upload ? 'uploading' : 'done',
      duration_sec: 0,
      thumbnail_path: thumb,
    });
    this.d.store.addFile({ recordingId, cameraId: id, path, kind: 'photo', startedAt: now.toISOString(), durationSec: 0, status: upload ? 'pending' : 'local' });
    if (upload) this.d.cloud.notifyFileReady(recordingId);
    return { recordingId };
  }

  /** Adiciona uma câmera: ONVIF (ou RTSP manual), go2rtc, teste de imagem e registro no Supabase. */
  async add(cmd: AddCamera, progress: (step: number) => void): Promise<{ cameraId: string; camera: Camera }> {
    const { secret, model, supportsTalk } = await this.resolve(cmd);
    progress(2);

    const tmpId = randomUUID();
    await this.d.go2rtc.addStream(tmpId, secret.rtspUrl);
    try {
      await this.retry(() => this.d.go2rtc.snapshot(tmpId), 3, 1500).catch(() => {
        throw new HubError('stream_failed');
      });
    } finally {
      await this.d.go2rtc.removeStream(tmpId).catch(() => undefined);
    }

    const ip = cmd.ip || rtspTarget(secret.rtspUrl)?.host || '';
    const row = await this.d.backend.insertCamera({
      name: cmd.name.slice(0, 60),
      room: cmd.room.slice(0, 60),
      model,
      ip,
      upload_to_cloud: cmd.uploadToCloud,
      supports_talk: supportsTalk,
      online: true,
      record_mode: this.mode,
    });
    this.d.store.setCameraSecret(row.id, secret);
    await this.attach(row, secret);
    progress(3);
    this.d.log.info({ cameraId: row.id, src: redact(secret.rtspUrl) }, 'câmera adicionada');
    return { cameraId: row.id, camera: cameraFromRow(row) };
  }

  private async resolve(cmd: AddCamera): Promise<{ secret: CameraSecret; model: string; supportsTalk: boolean }> {
    if (cmd.rtspUrl) {
      if (!/^rtsps?:\/\//i.test(cmd.rtspUrl)) throw new HubError('invalid_rtsp_url');
      const url = withCredentials(cmd.rtspUrl, cmd.username, cmd.password);
      const t = rtspTarget(url);
      if (!t || !(await (this.d.reachable ?? tcpReachable)(t.host, t.port))) throw new HubError('camera_unreachable');
      return { secret: { rtspUrl: url, username: cmd.username, password: cmd.password }, model: 'Câmera RTSP', supportsTalk: false };
    }
    if (!cmd.ip) throw new HubError('camera_unreachable');
    const [host, portStr] = cmd.ip.split(':');
    const ports = portStr ? [Number(portStr)] : ONVIF_PORTS;
    let lastErr: unknown = null;
    for (const port of ports) {
      try {
        const info = await this.d.onvif.probe({ hostname: host!, port, username: cmd.username, password: cmd.password, targetHeight: QUALITY_HEIGHT[this.quality] });
        return {
          secret: { rtspUrl: info.rtspUrl, username: cmd.username, password: cmd.password, onvif: { hostname: host!, port }, profileToken: info.profileToken },
          model: info.model,
          supportsTalk: info.supportsTalk,
        };
      } catch (e) {
        if (e instanceof CameraAuthError) throw new HubError('auth_failed');
        lastErr = e;
      }
    }
    this.d.log.debug({ err: lastErr }, 'ONVIF não respondeu');
    throw new HubError('camera_unreachable');
  }

  private async retry<T>(fn: () => Promise<T>, times: number, waitMs: number): Promise<T> {
    let err: unknown;
    for (let i = 0; i < times; i++) {
      try {
        return await fn();
      } catch (e) {
        err = e;
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
    throw err;
  }

  async remove(id: string) {
    this.get(id);
    await this.detach(id);
    this.d.store.deleteCameraSecret(id);
    for (const f of this.d.store.filesForCamera(id)) {
      rmSync(f.path, { force: true });
      this.d.store.deleteFile(f.recordingId);
    }
    await this.d.backend.deleteCamera(id);
  }

  /** A câmera foi apagada direto no banco (pelo app): só limpa o lado do hub. */
  async forget(id: string) {
    if (!this.cams.has(id)) return;
    await this.detach(id);
    this.d.store.deleteCameraSecret(id);
  }

  /** Nome, cômodo ou envio à nuvem mudaram no app. */
  updateRow(row: CameraRow) {
    const rt = this.cams.get(row.id);
    if (rt) rt.row = { ...rt.row, name: row.name, room: row.room, upload_to_cloud: row.upload_to_cloud };
  }

  // ------------------------------------------------------------------ ajustes
  async applySettings(s: Pick<SettingsRow, 'record_mode' | 'quality'>) {
    const modeChanged = s.record_mode !== this.mode;
    const qualityChanged = s.quality !== this.quality;
    this.mode = s.record_mode;
    this.quality = s.quality;
    if (qualityChanged) await this.reprofile();
    if (modeChanged) for (const rt of this.cams.values()) if (!rt.manual) this.applyMode(rt);
  }

  /** Troca o perfil ONVIF das câmeras para a nova qualidade. */
  private async reprofile() {
    for (const rt of this.cams.values()) {
      const o = rt.secret.onvif;
      if (!o) continue;
      try {
        const info = await this.d.onvif.probe({ hostname: o.hostname, port: o.port, username: rt.secret.username, password: rt.secret.password, targetHeight: QUALITY_HEIGHT[this.quality] });
        if (info.profileToken === rt.secret.profileToken) continue;
        rt.secret = { ...rt.secret, rtspUrl: info.rtspUrl, profileToken: info.profileToken };
        this.d.store.setCameraSecret(rt.row.id, rt.secret);
        await this.d.go2rtc.addStream(rt.row.id, rt.secret.rtspUrl);
      } catch (err) {
        this.d.log.warn({ err, cameraId: rt.row.id }, 'não foi possível trocar a qualidade');
      }
    }
  }

  // ------------------------------------------------------------------ eventos
  private async onMotion(id: string) {
    const rt = this.cams.get(id);
    if (!rt || !rt.online) return;
    let recordingId = rt.recorder.current?.id ?? null;
    if (!recordingId && this.mode === 'motion') {
      recordingId = await rt.recorder.start('motion', this.d.cfg.MOTION_CLIP_SECONDS).catch(() => null);
    }
    let thumbnail: string | null = null;
    try {
      const jpeg = await this.d.go2rtc.snapshot(id);
      thumbnail = await this.d.backend.uploadThumbnail(`evt-${randomUUID()}.jpg`, jpeg);
    } catch {
      thumbnail = null;
    }
    await this.d.backend.insertEvent({ camera_id: id, type: 'motion', recording_id: recordingId, thumbnail_path: thumbnail }).catch((err) => this.d.log.warn({ err }, 'falha ao registrar movimento'));
  }

  /** Verifica se cada câmera responde e avisa o app quando muda. */
  async checkHealth() {
    const reach = this.d.reachable ?? tcpReachable;
    await Promise.all(
      [...this.cams.values()].map(async (rt) => {
        const t = rtspTarget(rt.secret.rtspUrl);
        const online = t ? await reach(t.host, t.port) : false;
        if (online === rt.online) return;
        rt.online = online;
        rt.row = { ...rt.row, online };
        this.d.log.info({ cameraId: rt.row.id, online }, 'câmera mudou de estado');
        await this.d.backend.updateCamera(rt.row.id, { online }).catch(() => undefined);
        this.d.emit({ type: 'cameraStatus', cameraId: rt.row.id, online });
        if (online) {
          await this.d.backend.insertEvent({ camera_id: rt.row.id, type: 'reconnected' }).catch(() => undefined);
          if (this.mode === 'continuous' && !rt.recorder.current) void this.nextSegment(rt.row.id);
        } else if (rt.recorder.current) {
          await rt.recorder.stop();
        }
      }),
    );
  }
}
