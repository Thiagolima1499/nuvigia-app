import { z } from 'zod';

import { Camera, CameraEvent, Settings } from './models';

/** Comandos do app para o hub (canal Realtime de comandos). */
export const HubCommand = z.discriminatedUnion('type', [
  z.object({ type: z.literal('startRecording'), cameraId: z.string() }),
  z.object({ type: z.literal('stopRecording'), cameraId: z.string() }),
  z.object({ type: z.literal('snapshot'), cameraId: z.string() }),
  z.object({ type: z.literal('setMute'), cameraId: z.string(), muted: z.boolean() }),
  z.object({ type: z.literal('startTalk'), cameraId: z.string() }),
  z.object({ type: z.literal('stopTalk'), cameraId: z.string() }),
  z.object({ type: z.literal('updateSettings'), settings: Settings.partial() }),
  z.object({ type: z.literal('discoverCameras') }),
  z.object({
    type: z.literal('addCamera'),
    name: z.string().min(1),
    room: z.string(),
    ip: z.string(),
    rtspUrl: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    uploadToCloud: z.boolean(),
  }),
]);
export type HubCommand = z.infer<typeof HubCommand>;

/** Eventos do hub para o app (canal Realtime de eventos). */
export const HubEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('cameraStatus'), cameraId: z.string(), online: z.boolean() }),
  z.object({ type: z.literal('recordingStarted'), cameraId: z.string(), recordingId: z.string(), at: z.string() }),
  z.object({ type: z.literal('recordingStopped'), cameraId: z.string(), recordingId: z.string(), at: z.string() }),
  z.object({ type: z.literal('uploadProgress'), recordingId: z.string(), progress: z.number().min(0).max(100) }),
  z.object({ type: z.literal('uploadFailed'), recordingId: z.string(), reason: z.string() }),
  z.object({ type: z.literal('cameraEvent'), event: CameraEvent }),
  z.object({ type: z.literal('cameraDiscovered'), model: z.string(), ip: z.string() }),
  z.object({ type: z.literal('cameraAdded'), camera: Camera }),
]);
export type HubEvent = z.infer<typeof HubEvent>;
