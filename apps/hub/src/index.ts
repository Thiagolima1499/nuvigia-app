import { join } from 'node:path';

import pino from 'pino';

import { HubRemovedError, SupabaseBackend } from './backend';
import { CameraManager } from './cameras';
import { HubChannel } from './channel';
import type { CloudProviderId } from '@nuvigia/shared';

import { GoogleDrive } from './cloud/google';
import type { OAuthToken } from './cloud/oauth';
import { OneDrive } from './cloud/onedrive';
import type { CloudProvider } from './cloud/provider';
import { Uploader } from './cloud/uploader';
import { handleCommand } from './commands';
import { loadConfig } from './config';
import { parseKey, Secrets } from './crypto';
import { Go2rtc, streamName } from './go2rtc';
import { startHttp } from './http';
import { LinkSigner } from './links';
import { LiveService } from './live';
import { connectSupabase } from './identity';
import { cleanLocalFiles, forgetRecording } from './janitor';
import { announce } from './mdns';
import { OnvifService } from './onvif';
import { Pairing } from './pairing';
import { spawnProcess } from './proc';
import { LocalStore } from './store';
import { watchDb } from './watch';

const HEARTBEAT_MS = 30_000;
const JANITOR_MS = 60 * 60_000;
/** Código de saída para o Docker reiniciar o hub e registrá-lo de novo. */
const EXIT_RESTART = 75;

async function main() {
  const cfg = loadConfig();
  const log = pino({ level: cfg.LOG_LEVEL, base: { app: 'nuvigia-hub', v: cfg.version } });
  const secretKey = parseKey(cfg.HUB_SECRET_KEY);
  const secrets = new Secrets(secretKey);
  const signer = new LinkSigner(secretKey);
  const store = new LocalStore(join(cfg.DATA_DIR, 'hub.db'), secrets);

  const { supabase, identity } = await connectSupabase(cfg, store, log);
  const backend = new SupabaseBackend(supabase, identity.hubId);

  const pairing = new Pairing(backend, log);
  const http = startHttp(pairing, cfg.HTTP_HOST, cfg.HTTP_PORT, {
    signer,
    go2rtcUrl: cfg.GO2RTC_URL,
    streamName,
    filePath: (id) => store.getFile(id)?.path ?? null,
  });
  log.info(`página do hub em http://<ip-deste-computador>:${cfg.HTTP_PORT}`);
  const unannounce = cfg.MDNS ? announce({ name: cfg.HUB_NAME, port: cfg.HTTP_PORT, hubId: identity.hubId, version: cfg.version }) : () => undefined;

  const removed = () => {
    log.warn('este hub foi desvinculado no app; apagando a identidade para parear de novo');
    store.clearIdentity();
    process.exit(EXIT_RESTART);
  };

  let heartbeat: ReturnType<typeof setInterval> | null = null;
  const beat = () =>
    backend
      .heartbeat(cfg.version)
      .then(() => backend.getOwnerId())
      .then((owner) => {
        if (owner === null && pairing.state.status === 'paired') removed();
      })
      .catch((err) => {
        if (err instanceof HubRemovedError) removed();
        else log.warn({ err: err.message }, 'heartbeat falhou');
      });
  await beat();
  heartbeat = setInterval(() => void beat(), HEARTBEAT_MS);

  try {
    await pairing.start();
  } catch (err) {
    if (err instanceof HubRemovedError) removed();
    throw err;
  }
  pairing.stop();

  const go2rtc = new Go2rtc(cfg.GO2RTC_URL, cfg.GO2RTC_RTSP);
  const onvif = new OnvifService();
  let channel: HubChannel | null = null;
  let settings = await backend.getSettings();
  const tokenStore = <T,>(id: CloudProviderId) => ({ get: () => store.getCloudToken<T>(id), set: (t: T) => store.setCloudToken(id, t) });
  const makeProvider = (id: CloudProviderId): CloudProvider => {
    if (id === 'google') return new GoogleDrive(tokenStore<OAuthToken>('google'));
    return new OneDrive(tokenStore<OAuthToken>('onedrive'));
  };
  const cloud: Uploader = new Uploader({
    backend,
    store,
    log,
    makeProvider,
    cameraName: (id: string): string => cameras.list().find((c) => c.id === id)?.name ?? 'Câmera',
    settings: () => settings,
    emit: (e) => void channel?.emit(e),
  });
  const cameras: CameraManager = new CameraManager({ cfg, backend, store, go2rtc, onvif, cloud, spawn: spawnProcess, log, emit: (e) => void channel?.emit(e) });
  channel = new HubChannel(
    supabase,
    identity.hubId,
    (cmd, emit) => handleCommand(cmd, { version: cfg.version, backend, cameras, cloud, onvif, log, publicUrl: cfg.HUB_PUBLIC_URL, signer, store }, emit),
    log,
  );
  const live = new LiveService({
    go2rtc,
    hasCamera: (id) => cameras.has(id),
    isOnline: (id) => cameras.isOnline(id),
    send: (msg) => channel!.signal(msg),
    log,
  });
  channel.onSignal((p) => void live.onSignal(p));
  await backend.setPublicUrl(cfg.HUB_PUBLIC_URL ?? null).catch((err) => log.warn({ err: err.message }, 'não foi possível salvar o endereço público'));

  await cameras.start(settings);
  cloud.start();
  channel.start();
  const unwatch = watchDb(supabase, identity.hubId, {
    onSettings: (s) => {
      settings = s;
      void cameras.applySettings(s);
    },
    onCameraUpdated: (c) => cameras.updateRow(c),
    onCameraDeleted: (id) => void cameras.forget(id),
    onRecordingDeleted: (id) => forgetRecording(store, id),
  });

  const janitor = () =>
    cleanLocalFiles({ store, backend, keepDays: cfg.LOCAL_KEEP_DAYS, retentionDays: settings?.retention_days ?? 30, log }).catch((err) => log.warn({ err }, 'limpeza falhou'));
  void janitor();
  const janitorTimer = setInterval(() => void janitor(), JANITOR_MS);
  log.info({ cameras: cameras.list().length }, 'hub pronto');

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({ signal }, 'desligando o hub');
    if (heartbeat) clearInterval(heartbeat);
    clearInterval(janitorTimer);
    await cameras.stop().catch(() => undefined);
    await cloud.stop().catch(() => undefined);
    await channel?.close();
    await unwatch().catch(() => undefined);
    unannounce();
    http.close();
    store.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
