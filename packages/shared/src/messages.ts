import { z } from 'zod';

import { Camera, CameraEvent, Settings } from './models';

/** Comandos do app para o hub (canal Realtime de comandos). */
export const HubCommand = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ping') }),
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
  z.object({ type: z.literal('removeCamera'), cameraId: z.string() }),
  z.object({ type: z.literal('retryUpload'), recordingId: z.string() }),
  /** Entrega ao hub o resultado do login feito no app (código OAuth + PKCE ou token do CloudKit). */
  z.object({
    type: z.literal('connectCloud'),
    provider: z.enum(['google', 'onedrive', 'icloud']),
    code: z.string().optional(),
    codeVerifier: z.string().optional(),
    redirectUri: z.string().optional(),
    /** ID do cliente OAuth usado no login (muda entre iOS e Android); o hub usa para renovar o token. */
    clientId: z.string().optional(),
    ckWebAuthToken: z.string().optional(),
  }),
  z.object({ type: z.literal('disconnectCloud') }),
  /** Plano B do ao vivo: endereço HLS temporário (só com túnel configurado no hub). */
  z.object({ type: z.literal('liveHls'), cameraId: z.string() }),
  /** Para assistir uma gravação: arquivo no hub (pelo túnel) ou link do provedor. */
  z.object({ type: z.literal('recordingLink'), recordingId: z.string() }),
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
  z.object({ type: z.literal('cameraDiscovered'), model: z.string(), ip: z.string(), needsCredentials: z.boolean().optional() }),
  z.object({ type: z.literal('discoveryFinished'), count: z.number() }),
  z.object({ type: z.literal('addCameraProgress'), step: z.number().int().min(0).max(3) }),
  z.object({ type: z.literal('cameraAdded'), camera: Camera }),
]);
export type HubEvent = z.infer<typeof HubEvent>;

/** Comando como trafega no canal: com id para casar a resposta. */
export const CommandEnvelope = z.object({ requestId: z.string().min(1), command: HubCommand });
export type CommandEnvelope = z.infer<typeof CommandEnvelope>;
