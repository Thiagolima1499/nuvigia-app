import type { Camera, CameraEvent, CloudProviderId, CloudStatus, Quality, Recording, RecordMode } from './models';

/** Linhas das tabelas do Supabase (snake_case), espelho de supabase/migrations. */
export type HubRow = {
  id: string;
  owner_id: string | null;
  hub_user_id: string;
  name: string;
  version: string | null;
  online: boolean;
  last_seen_at: string | null;
  public_url: string | null;
  created_at: string;
};

export type CameraRow = {
  id: string;
  hub_id: string;
  owner_id: string | null;
  name: string;
  room: string;
  model: string;
  ip: string;
  online: boolean;
  recording: boolean;
  rec_started_at: string | null;
  record_mode: RecordMode;
  upload_to_cloud: boolean;
  supports_talk: boolean;
  created_at: string;
};

export type RecordingRow = {
  id: string;
  camera_id: string;
  hub_id: string;
  owner_id: string | null;
  started_at: string;
  duration_sec: number;
  kind: 'video' | 'photo';
  provider: CloudProviderId | null;
  cloud_file_ref: string | null;
  upload_progress: number;
  status: Recording['status'];
  error: string | null;
  thumbnail_path: string | null;
  created_at: string;
};

export type EventRow = {
  id: string;
  camera_id: string;
  hub_id: string;
  owner_id: string | null;
  at: string;
  type: CameraEvent['type'];
  recording_id: string | null;
  thumbnail_path: string | null;
};

export type SettingsRow = {
  hub_id: string;
  owner_id: string | null;
  quality: Quality;
  record_mode: RecordMode;
  wifi_only: boolean;
  notify_motion: boolean;
  retention_days: number | null;
  cloud_provider: CloudProviderId | null;
  cloud_connected: boolean;
  cloud_account: string | null;
  cloud_used_bytes: number;
  cloud_total_bytes: number | null;
  cloud_folder_ref: string | null;
  updated_at: string;
};

export function cameraFromRow(r: CameraRow): Camera {
  return {
    id: r.id,
    hubId: r.hub_id,
    name: r.name,
    room: r.room,
    model: r.model,
    ip: r.ip,
    rtspUrl: '',
    online: r.online,
    recording: r.recording,
    recStartedAt: r.rec_started_at ?? undefined,
    recordMode: r.record_mode,
    uploadToDrive: r.upload_to_cloud,
  };
}

export function recordingFromRow(r: RecordingRow): Recording {
  return {
    id: r.id,
    cameraId: r.camera_id,
    startedAt: r.started_at,
    durationSec: r.duration_sec,
    kind: r.kind,
    provider: r.provider ?? undefined,
    cloudFileRef: r.cloud_file_ref ?? undefined,
    uploadProgress: r.upload_progress,
    status: r.status,
  };
}

export function eventFromRow(r: EventRow): CameraEvent {
  return { id: r.id, cameraId: r.camera_id, at: r.at, type: r.type, recordingId: r.recording_id ?? undefined };
}

export function cloudStatusFromSettings(s: Pick<SettingsRow, 'cloud_provider' | 'cloud_connected' | 'cloud_account' | 'cloud_used_bytes' | 'cloud_total_bytes' | 'cloud_folder_ref'>): CloudStatus {
  return {
    provider: s.cloud_provider,
    connected: s.cloud_connected,
    account: s.cloud_account ?? undefined,
    usedBytes: Number(s.cloud_used_bytes) || 0,
    totalBytes: s.cloud_total_bytes == null ? undefined : Number(s.cloud_total_bytes),
    folderRef: s.cloud_folder_ref ?? undefined,
  };
}
