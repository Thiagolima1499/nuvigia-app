import type { Camera, CloudProviderId, Quality, Recording, RecordMode } from '@nuvigia/shared';
import { create } from 'zustand';

import { mockCameras, mockRecordings, MOCK_HUB_ID } from '@/data/mock';

/** Situação da conexão com o hub (alimenta estados de carregamento e erro). */
export type HubStatus = 'loading' | 'ready' | 'unreachable';
export type HomeLayout = 'list' | 'grid';

export type Switches = { wifiOnly: boolean; notifyMotion: boolean; deleteAfter30: boolean };

export type AppState = {
  hubStatus: HubStatus;
  cameras: Camera[];
  recordings: Recording[];
  /** Provedor conectado, ou null quando não há nuvem. */
  cloud: CloudProviderId | null;
  quality: Quality;
  recordMode: RecordMode;
  switches: Switches;
  homeLayout: HomeLayout;
  /** Diálogo "Onde salvar as gravações?". */
  cloudDialog: { open: boolean; pick: CloudProviderId };

  // ações
  load: () => void;
  retryHub: () => void;
  setHubStatus: (s: HubStatus) => void;
  startRecording: (cameraId: string) => void;
  /** Para a gravação e cria o clipe na lista de Gravações (enviando). */
  stopRecording: (cameraId: string) => void;
  addCamera: (input: { name: string; room: string; model: string; ip: string; uploadToCloud: boolean }) => string;
  connectCloud: (p: CloudProviderId) => void;
  disconnectCloud: () => void;
  openCloudDialog: (pick?: CloudProviderId) => void;
  setDialogPick: (p: CloudProviderId) => void;
  closeCloudDialog: () => void;
  setQuality: (q: Quality) => void;
  setRecordMode: (m: RecordMode) => void;
  toggleSwitch: (k: keyof Switches) => void;
  setHomeLayout: (l: HomeLayout) => void;
  /** Avança 1% os envios em andamento (chamado a cada 1s, como no protótipo). */
  tickUploads: () => void;
  retryUpload: (recordingId: string) => void;
  /** Só para simular estados no catálogo. */
  simulate: (patch: Partial<Pick<AppState, 'cameras' | 'recordings' | 'hubStatus'>>) => void;
  reset: () => void;
};

const initialData = () => ({
  hubStatus: 'ready' as HubStatus,
  cameras: mockCameras(),
  recordings: mockRecordings(),
  cloud: 'google' as CloudProviderId | null,
  quality: '1080p' as Quality,
  recordMode: 'motion' as RecordMode,
  switches: { wifiOnly: true, notifyMotion: true, deleteAfter30: true },
  homeLayout: 'list' as HomeLayout,
  cloudDialog: { open: false, pick: 'google' as CloudProviderId },
});

let seq = 0;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export const useAppStore = create<AppState>()((set, get) => ({
  ...initialData(),

  load: () => set({ hubStatus: 'ready' }),
  retryHub: () => {
    set({ hubStatus: 'loading' });
    setTimeout(() => set({ hubStatus: 'ready' }), 900);
  },
  setHubStatus: (hubStatus) => set({ hubStatus }),

  startRecording: (cameraId) =>
    set((s) => ({
      cameras: s.cameras.map((c) => (c.id === cameraId ? { ...c, recording: true, recStartedAt: new Date().toISOString() } : c)),
    })),

  stopRecording: (cameraId) => {
    const cam = get().cameras.find((c) => c.id === cameraId);
    if (!cam?.recording) return;
    const started = cam.recStartedAt ? new Date(cam.recStartedAt) : new Date();
    const durationSec = Math.max(1, Math.round((Date.now() - started.getTime()) / 1000));
    const rec: Recording = {
      id: newId('rec'),
      cameraId,
      startedAt: started.toISOString(),
      durationSec,
      kind: 'video',
      provider: get().cloud ?? undefined,
      uploadProgress: 0,
      status: 'uploading',
    };
    set((s) => ({
      cameras: s.cameras.map((c) => (c.id === cameraId ? { ...c, recording: false, recStartedAt: undefined } : c)),
      recordings: [rec, ...s.recordings],
    }));
  },

  addCamera: ({ name, room, model, ip, uploadToCloud }) => {
    const id = newId('cam');
    const cam: Camera = {
      id,
      hubId: MOCK_HUB_ID,
      name: name.trim() || 'Nova câmera',
      room: room.trim() || 'Casa',
      model,
      ip,
      rtspUrl: '',
      online: true,
      recording: false,
      recordMode: get().recordMode,
      uploadToDrive: uploadToCloud,
    };
    set((s) => ({ cameras: [...s.cameras, cam] }));
    return id;
  },

  connectCloud: (p) => set({ cloud: p, cloudDialog: { open: false, pick: p } }),
  disconnectCloud: () => set({ cloud: null }),
  openCloudDialog: (pick) => set((s) => ({ cloudDialog: { open: true, pick: pick ?? s.cloud ?? 'google' } })),
  setDialogPick: (p) => set((s) => ({ cloudDialog: { ...s.cloudDialog, pick: p } })),
  closeCloudDialog: () => set((s) => ({ cloudDialog: { ...s.cloudDialog, open: false } })),

  setQuality: (quality) => set({ quality }),
  setRecordMode: (recordMode) => set((s) => ({ recordMode, cameras: s.cameras.map((c) => ({ ...c, recordMode })) })),
  toggleSwitch: (k) => set((s) => ({ switches: { ...s.switches, [k]: !s.switches[k] } })),
  setHomeLayout: (homeLayout) => set({ homeLayout }),

  tickUploads: () => {
    const s = get();
    if (!s.cloud || !s.recordings.some((r) => r.status === 'uploading')) return;
    set({
      recordings: s.recordings.map((r) => {
        if (r.status !== 'uploading') return r;
        const p = Math.min(100, r.uploadProgress + 1);
        return p >= 100 ? { ...r, uploadProgress: 100, status: 'done', provider: s.cloud ?? undefined } : { ...r, uploadProgress: p };
      }),
    });
  },
  retryUpload: (id) =>
    set((s) => ({ recordings: s.recordings.map((r) => (r.id === id ? { ...r, status: 'uploading', uploadProgress: Math.min(r.uploadProgress, 99) } : r)) })),

  simulate: (patch) => set(patch),
  reset: () => set(initialData()),
}));

/** Câmeras gravando agora. */
export const selectRecordingCount = (s: AppState) => s.cameras.filter((c) => c.recording).length;
