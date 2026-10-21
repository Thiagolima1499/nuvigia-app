import type { Camera, CameraEvent, Recording } from '@nuvigia/shared';

/** Rede Wi‑Fi simulada (protótipo). */
export const MOCK_SSID = 'Casa_5G';
export const MOCK_HUB_ID = 'hub-casa';

/** Data de hoje/ontem no horário dado (para as gravações simuladas). */
function at(daysAgo: number, h: number, m: number, now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, h, m);
  return d.toISOString();
}

export function mockCameras(now = Date.now()): Camera[] {
  const base = { hubId: MOCK_HUB_ID, recordMode: 'motion' as const, uploadToDrive: true, rtspUrl: '' };
  return [
    { ...base, id: 'cam-sala', name: 'Sala de estar', room: 'Térreo', model: 'Tapo C200', ip: '192.168.0.21', online: true, recording: true, recStartedAt: new Date(now - 754_000).toISOString() },
    { ...base, id: 'cam-portao', name: 'Portão', room: 'Entrada', model: 'Intelbras iM3', ip: '192.168.0.22', online: true, recording: false },
    { ...base, id: 'cam-quintal', name: 'Quintal', room: 'Fundos', model: 'Câmera ONVIF', ip: '192.168.0.23', online: true, recording: false },
    { ...base, id: 'cam-garagem', name: 'Garagem', room: 'Térreo', model: 'Tapo C200', ip: '192.168.0.24', online: false, recording: false },
  ];
}

export function mockRecordings(now = new Date()): Recording[] {
  return [
    { id: 'rec-1', cameraId: 'cam-sala', startedAt: at(0, 14, 32, now), durationSec: 72, kind: 'video', uploadProgress: 64, status: 'uploading' },
    { id: 'rec-2', cameraId: 'cam-portao', startedAt: at(0, 13, 5, now), durationSec: 48, kind: 'video', uploadProgress: 100, status: 'done' },
    { id: 'rec-3', cameraId: 'cam-quintal', startedAt: at(0, 9, 41, now), durationSec: 123, kind: 'video', uploadProgress: 100, status: 'done' },
    { id: 'rec-4', cameraId: 'cam-portao', startedAt: at(1, 22, 17, now), durationSec: 35, kind: 'video', uploadProgress: 100, status: 'done' },
    { id: 'rec-5', cameraId: 'cam-sala', startedAt: at(1, 18, 50, now), durationSec: 260, kind: 'video', uploadProgress: 100, status: 'done' },
  ];
}

/** Eventos de "Hoje" (iguais para todas as câmeras no protótipo). */
export function mockEvents(cameraId: string, now = new Date()): (CameraEvent & { label: string; tag: 'Gravado' | 'Sistema' })[] {
  return [
    { id: `${cameraId}-e1`, cameraId, at: at(0, 14, 32, now), type: 'motion', label: 'Movimento detectado', tag: 'Gravado' },
    { id: `${cameraId}-e2`, cameraId, at: at(0, 11, 8, now), type: 'person', label: 'Pessoa na entrada', tag: 'Gravado' },
    { id: `${cameraId}-e3`, cameraId, at: at(0, 7, 15, now), type: 'reconnected', label: 'Câmera reconectada', tag: 'Sistema' },
  ];
}

export type DiscoveredDevice = { model: string; ip: string };

/** Câmeras "encontradas" no passo 1 de Adicionar câmera. */
export const MOCK_DEVICES: DiscoveredDevice[] = [
  { model: 'Tapo C200', ip: '192.168.0.41' },
  { model: 'Intelbras iM3', ip: '192.168.0.57' },
  { model: 'Câmera ONVIF', ip: '192.168.0.63' },
];
