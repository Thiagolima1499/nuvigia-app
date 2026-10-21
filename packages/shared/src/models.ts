import { z } from 'zod';

/** Modelos de dados do README do hand-off ("Estado e dados"). */

export const CloudProviderId = z.enum(['google', 'onedrive']);
export type CloudProviderId = z.infer<typeof CloudProviderId>;

export const RecordMode = z.enum(['motion', 'continuous']);
export type RecordMode = z.infer<typeof RecordMode>;

export const Quality = z.enum(['720p', '1080p', '2K']);
export type Quality = z.infer<typeof Quality>;

const isoDate = z.iso.datetime({ offset: true });

export const Camera = z.object({
  id: z.string().min(1),
  hubId: z.string().min(1),
  name: z.string().min(1),
  room: z.string(),
  model: z.string(),
  ip: z.string(),
  /** Fica só no hub; o app recebe a URL sem credenciais. */
  rtspUrl: z.string(),
  online: z.boolean(),
  recording: z.boolean(),
  recStartedAt: isoDate.optional(),
  recordMode: RecordMode,
  uploadToDrive: z.boolean(),
});
export type Camera = z.infer<typeof Camera>;

export const RecordingStatus = z.enum(['recording', 'uploading', 'done', 'failed']);
export type RecordingStatus = z.infer<typeof RecordingStatus>;

export const Recording = z.object({
  id: z.string().min(1),
  cameraId: z.string().min(1),
  startedAt: isoDate,
  durationSec: z.number().int().nonnegative(),
  kind: z.enum(['video', 'photo']),
  provider: CloudProviderId.optional(),
  /** Antes `driveFileId`: referência do arquivo no provedor (Drive/OneDrive). */
  cloudFileRef: z.string().optional(),
  uploadProgress: z.number().min(0).max(100),
  status: RecordingStatus,
});
export type Recording = z.infer<typeof Recording>;

export const CameraEvent = z.object({
  id: z.string().min(1),
  cameraId: z.string().min(1),
  at: isoDate,
  type: z.enum(['motion', 'person', 'reconnected']),
  recordingId: z.string().optional(),
});
export type CameraEvent = z.infer<typeof CameraEvent>;

export const Settings = z.object({
  quality: Quality,
  recordMode: RecordMode,
  wifiOnly: z.boolean(),
  notifyMotion: z.boolean(),
  /** `null` = nunca apagar. Padrão do app: 30 dias. */
  retentionDays: z.number().int().positive().nullable(),
});
export type Settings = z.infer<typeof Settings>;

export const DEFAULT_SETTINGS: Settings = {
  quality: '1080p',
  recordMode: 'motion',
  wifiOnly: true,
  notifyMotion: true,
  retentionDays: 30,
};

export const CloudStatus = z.object({
  provider: CloudProviderId.nullable(),
  connected: z.boolean(),
  account: z.string().optional(),
  usedBytes: z.number().nonnegative(),
  totalBytes: z.number().nonnegative().optional(),
  folderRef: z.string().optional(),
});
export type CloudStatus = z.infer<typeof CloudStatus>;
