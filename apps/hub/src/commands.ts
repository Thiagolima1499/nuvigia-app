import type { HubCommand, HubEvent } from '@nuvigia/shared';
import type { Logger } from 'pino';

import type { Backend } from './backend';
import type { CameraManager } from './cameras';
import { HubError } from './cameras';
import type { CloudControl } from './cloud';
import type { OnvifService } from './onvif';

export type CommandDeps = {
  version: string;
  backend: Backend;
  cameras: CameraManager;
  cloud: CloudControl;
  onvif: OnvifService;
  log: Logger;
};

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
    // Falar pela câmera usa o canal de áudio do WebRTC (etapa 6).
    case 'startTalk':
    case 'stopTalk':
      throw new HubError('talk_unavailable');

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
