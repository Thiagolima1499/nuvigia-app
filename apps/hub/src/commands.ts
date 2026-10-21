import type { HubCommand, HubEvent } from '@nuvigia/shared';
import type { Logger } from 'pino';

import type { Backend } from './backend';
import type { CameraManager } from './cameras';
import { HubError } from './cameras';
import type { CloudControl } from './cloud';
import type { LinkSigner } from './links';
import type { OnvifService } from './onvif';
import type { LocalStore } from './store';

export type CommandDeps = {
  version: string;
  backend: Backend;
  cameras: CameraManager;
  cloud: CloudControl;
  onvif: OnvifService;
  log: Logger;
  /** Endereço do túnel do hub; sem ele não há HLS nem arquivo pelo hub. */
  publicUrl?: string;
  signer?: LinkSigner;
  store?: LocalStore;
};

const LINK_TTL_SEC = 15 * 60;
const tunnelUrl = (base: string, path: string) => `${base.replace(/\/$/, '')}${path}`;

/** Códigos de erro que o app entende; o resto vira "internal". */
const KNOWN = new Set([
  'camera_not_found',
  'camera_offline',
  'camera_unreachable',
  'auth_failed',
  'stream_failed',
  'invalid_rtsp_url',
  'cloud_unavailable',
  'talk_unavailable',
  'recording_not_found',
  'hls_unavailable',
  'link_unavailable',
]);

export function errorCode(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return e instanceof HubError || KNOWN.has(msg) ? msg : 'internal';
}

/** Executa um comando do app e devolve o `data` da resposta. */
export async function handleCommand(cmd: HubCommand, d: CommandDeps, emit: (e: HubEvent) => void): Promise<unknown> {
  switch (cmd.type) {
    case 'ping':
      return { version: d.version, cameras: d.cameras.list().length };

    case 'startRecording':
      return d.cameras.startManual(cmd.cameraId);
    case 'stopRecording':
      return d.cameras.stopManual(cmd.cameraId);
    case 'snapshot':
      return d.cameras.snapshot(cmd.cameraId);

    // O mudo é só no aparelho; o hub confirma para o app não ficar esperando.
    case 'setMute':
      return { muted: cmd.muted };
    // A voz vai pelo áudio da própria sessão WebRTC (o go2rtc repassa para a câmera).
    // Aqui só confirmamos se a câmera tem alto-falante.
    case 'startTalk': {
      const cam = d.cameras.list().find((c) => c.id === cmd.cameraId);
      if (!cam) throw new HubError('camera_not_found');
      if (!d.cameras.supportsTalk(cmd.cameraId)) throw new HubError('talk_unavailable');
      return { talking: true };
    }
    case 'stopTalk':
      return { talking: false };

    case 'liveHls': {
      if (!d.publicUrl || !d.signer) throw new HubError('hls_unavailable');
      if (!d.cameras.has(cmd.cameraId)) throw new HubError('camera_not_found');
      const { token, expiresAt } = d.signer.sign('hls', cmd.cameraId, LINK_TTL_SEC);
      return { url: tunnelUrl(d.publicUrl, `/hls/${token}/api/stream.m3u8`), expiresAt };
    }

    case 'recordingLink': {
      // 1) arquivo ainda no hub e túnel configurado: toca direto do hub
      const local = d.store?.getFile(cmd.recordingId);
      if (local && d.publicUrl && d.signer) {
        const { token, expiresAt } = d.signer.sign('file', cmd.recordingId, LINK_TTL_SEC);
        return { url: tunnelUrl(d.publicUrl, `/files/${token}`), expiresAt, kind: 'stream' };
      }
      // 2) senão, o link do arquivo no provedor (Drive/OneDrive), aberto no navegador
      const web = await d.cloud.webLink(cmd.recordingId);
      if (web) return { url: web, expiresAt: null, kind: 'web' };
      throw new HubError('link_unavailable');
    }

    case 'updateSettings': {
      const s = cmd.settings;
      const current = await d.backend.getSettings();
      if (current && (s.recordMode || s.quality)) {
        await d.cameras.applySettings({ record_mode: s.recordMode ?? current.record_mode, quality: s.quality ?? current.quality });
      }
      return { applied: true };
    }

    case 'discoverCameras': {
      const known = d.cameras.knownIps();
      const count = await d.onvif.discover((c) => {
        if (!known.has(c.ip)) emit({ type: 'cameraDiscovered', model: c.model, ip: c.ip, needsCredentials: true });
      });
      emit({ type: 'discoveryFinished', count });
      return { count };
    }

    case 'addCamera': {
      emit({ type: 'addCameraProgress', step: 1 });
      const { cameraId, camera } = await d.cameras.add(cmd, (step) => emit({ type: 'addCameraProgress', step }));
      emit({ type: 'cameraAdded', camera });
      return { cameraId };
    }

    case 'removeCamera':
      await d.cameras.remove(cmd.cameraId);
      return { removed: true };

    case 'retryUpload': {
      const rec = await d.backend.getRecording(cmd.recordingId);
      if (!rec) throw new HubError('recording_not_found');
      await d.cloud.retry(cmd.recordingId);
      return { queued: true };
    }

    case 'connectCloud':
      return d.cloud.connect(cmd);
    case 'disconnectCloud':
      await d.cloud.disconnect();
      return { disconnected: true };
  }
}
