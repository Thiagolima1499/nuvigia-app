import type { Camera, CameraEvent, CloudProviderId, CloudStatus, HubCommand, Quality, Recording, RecordMode } from '@nuvigia/shared';
import { create } from 'zustand';

import { mockCameras, mockEvents, mockRecordings, MOCK_HUB_ID } from '@/data/mock';
import { PROVIDERS } from '@/data/providers';

/** Situação da conexão com o hub (alimenta estados de carregamento e erro). */
export type HubStatus = 'loading' | 'ready' | 'unreachable';
export type HomeLayout = 'list' | 'grid';
export type Switches = { wifiOnly: boolean; notifyMotion: boolean; deleteAfter30: boolean };

/** Evento exibido na lista "Hoje" da tela Ao vivo. */
export type UiEvent = CameraEvent & { label: string; tag: 'Gravado' | 'Sistema' };

/**
 * Ponte para o backend real (Supabase + hub). Em modo demonstração é null e as ações
 * só mexem no estado local, simulando o hub.
 */
export type Remote = {
  send: (command: HubCommand, timeoutMs?: number) => Promise<unknown>;
  updateSettings: (patch: Partial<{ quality: Quality; record_mode: RecordMode; wifi_only: boolean; notify_motion: boolean; retention_days: number | null }>) => Promise<void>;
  updateCamera: (id: string, patch: Partial<{ name: string; room: string }>) => Promise<void>;
  deleteRecording: (id: string) => Promise<void>;
};

export type AppState = {
  mode: 'demo' | 'live';
  remote: Remote | null;
  hubId: string | null;
  hubStatus: HubStatus;
  cameras: Camera[];
  recordings: Recording[];
  events: UiEvent[];
  /** Provedor conectado, ou null quando não há nuvem. */
  cloud: CloudProviderId | null;
  /** Status publicado pelo hub (modo real). Em demonstração vem dos dados simulados. */
  cloudStatus: CloudStatus | null;
  quality: Quality;
  recordMode: RecordMode;
  switches: Switches;
  homeLayout: HomeLayout;
  /** Diálogo "Onde salvar as gravações?". */
  cloudDialog: { open: boolean; pick: CloudProviderId };
  /** Último erro de comando para exibir em aviso. */
  lastError: string | null;

  // conexão com o backend
  attachRemote: (hubId: string, remote: Remote) => void;
  detachRemote: () => void;
  setHubStatus: (s: HubStatus) => void;
  setCameras: (c: Camera[]) => void;
  upsertCamera: (c: Camera) => void;
  removeCameraLocal: (id: string) => void;
  setRecordings: (r: Recording[]) => void;
  upsertRecording: (r: Recording) => void;
  removeRecordingLocal: (id: string) => void;
  setEvents: (e: UiEvent[]) => void;
  addEvent: (e: UiEvent) => void;
  applySettings: (s: { quality: Quality; recordMode: RecordMode; wifiOnly: boolean; notifyMotion: boolean; retentionDays: number | null; cloud: CloudStatus }) => void;

  // ações da interface
  retryHub: () => void;
  startRecording: (cameraId: string) => void;
  /** Para a gravação e cria o clipe na lista de Gravações (enviando). */
  stopRecording: (cameraId: string) => void;
  snapshot: (cameraId: string) => Promise<void>;
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
  /** Avança 1% os envios em andamento (só na demonstração; no real vem do hub). */
  tickUploads: () => void;
  retryUpload: (recordingId: string) => void;
  /** Progresso de envio publicado pelo hub no Realtime (mais frequente que o banco). */
  setUploadProgress: (recordingId: string, progress: number) => void;
  /** Liga a nuvem no hub com o resultado do login feito no app. */
  linkCloud: (command: Extract<HubCommand, { type: 'connectCloud' }>) => Promise<void>;
  clearError: () => void;
  /** Só para simular estados no catálogo. */
  simulate: (patch: Partial<Pick<AppState, 'cameras' | 'recordings' | 'hubStatus'>>) => void;
  reset: () => void;
};

export const EVENT_LABEL: Record<CameraEvent['type'], { label: string; tag: UiEvent['tag'] }> = {
  motion: { label: 'Movimento detectado', tag: 'Gravado' },
  person: { label: 'Pessoa na entrada', tag: 'Gravado' },
  reconnected: { label: 'Câmera reconectada', tag: 'Sistema' },
};

export const toUiEvent = (e: CameraEvent): UiEvent => ({ ...e, ...EVENT_LABEL[e.type] });

const demoData = () => {
  const cameras = mockCameras();
  return {
    mode: 'demo' as const,
    remote: null,
    hubId: MOCK_HUB_ID as string | null,
    hubStatus: 'ready' as HubStatus,
    cameras,
    recordings: mockRecordings(),
    events: cameras.flatMap((c) => mockEvents(c.id)),
    cloud: 'google' as CloudProviderId | null,
    cloudStatus: null as CloudStatus | null,
    quality: '1080p' as Quality,
    recordMode: 'motion' as RecordMode,
    switches: { wifiOnly: true, notifyMotion: true, deleteAfter30: true },
    homeLayout: 'list' as HomeLayout,
    cloudDialog: { open: false, pick: 'google' as CloudProviderId },
    lastError: null as string | null,
  };
};

let seq = 0;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

const errorText = (e: unknown) => (e instanceof Error && e.message === 'hub_timeout' ? 'O hub não respondeu. Tente de novo.' : 'Não foi possível falar com o hub.');

export const useAppStore = create<AppState>()((set, get) => {
  /** Envia ao hub em modo real; registra o erro para a interface. */
  const remoteSend = (command: HubCommand) => {
    const r = get().remote;
    if (!r) return Promise.resolve(undefined);
    return r.send(command).catch((e: unknown) => {
      set({ lastError: errorText(e) });
      throw e;
    });
  };
  const live = () => get().mode === 'live';

  return {
    ...demoData(),

    attachRemote: (hubId, remote) =>
      set({ mode: 'live', remote, hubId, hubStatus: 'loading', cameras: [], recordings: [], events: [], cloud: null, cloudStatus: null }),
    detachRemote: () => set(demoData()),
    setHubStatus: (hubStatus) => set({ hubStatus }),
    setCameras: (cameras) => set({ cameras }),
    upsertCamera: (c) => set((s) => ({ cameras: s.cameras.some((x) => x.id === c.id) ? s.cameras.map((x) => (x.id === c.id ? c : x)) : [...s.cameras, c] })),
    removeCameraLocal: (id) => set((s) => ({ cameras: s.cameras.filter((c) => c.id !== id) })),
    setRecordings: (recordings) => set({ recordings }),
    upsertRecording: (r) =>
      set((s) => ({
        recordings: s.recordings.some((x) => x.id === r.id)
          ? s.recordings.map((x) => (x.id === r.id ? r : x))
          : [r, ...s.recordings].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
      })),
    removeRecordingLocal: (id) => set((s) => ({ recordings: s.recordings.filter((r) => r.id !== id) })),
    setEvents: (events) => set({ events }),
    addEvent: (e) => set((s) => ({ events: [e, ...s.events.filter((x) => x.id !== e.id)] })),
    applySettings: ({ quality, recordMode, wifiOnly, notifyMotion, retentionDays, cloud }) =>
      set((s) => ({
        quality,
        recordMode,
        switches: { ...s.switches, wifiOnly, notifyMotion, deleteAfter30: retentionDays != null },
        cloud: cloud.connected ? cloud.provider : null,
        cloudStatus: cloud,
      })),

    retryHub: () => {
      if (live()) {
        set({ hubStatus: 'loading' });
        remoteSend({ type: 'ping' })
          .then(() => set({ hubStatus: 'ready' }))
          .catch(() => set({ hubStatus: 'unreachable' }));
        return;
      }
      set({ hubStatus: 'loading' });
      setTimeout(() => set({ hubStatus: 'ready' }), 900);
    },

    startRecording: (cameraId) => {
      const prev = get().cameras;
      set({ cameras: prev.map((c) => (c.id === cameraId ? { ...c, recording: true, recStartedAt: new Date().toISOString() } : c)) });
      if (live()) remoteSend({ type: 'startRecording', cameraId }).catch(() => set({ cameras: prev }));
    },

    stopRecording: (cameraId) => {
      const cam = get().cameras.find((c) => c.id === cameraId);
      if (!cam?.recording) return;
      if (live()) {
        const prev = get().cameras;
        set({ cameras: prev.map((c) => (c.id === cameraId ? { ...c, recording: false, recStartedAt: undefined } : c)) });
        // o hub cria/atualiza a gravação e o app recebe pela assinatura de mudanças
        remoteSend({ type: 'stopRecording', cameraId }).catch(() => set({ cameras: prev }));
        return;
      }
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

    snapshot: async (cameraId) => {
      if (live()) await remoteSend({ type: 'snapshot', cameraId });
    },

    addCamera: ({ name, room, model, ip, uploadToCloud }) => {
      const id = newId('cam');
      const cam: Camera = {
        id,
        hubId: get().hubId ?? MOCK_HUB_ID,
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
    disconnectCloud: () => {
      set({ cloud: null });
      if (live()) remoteSend({ type: 'disconnectCloud' }).catch(() => undefined);
    },
    openCloudDialog: (pick) => set((s) => ({ cloudDialog: { open: true, pick: pick ?? s.cloud ?? 'google' } })),
    setDialogPick: (p) => set((s) => ({ cloudDialog: { ...s.cloudDialog, pick: p } })),
    closeCloudDialog: () => set((s) => ({ cloudDialog: { ...s.cloudDialog, open: false } })),

    setQuality: (quality) => {
      set({ quality });
      get().remote?.updateSettings({ quality }).catch(() => set({ lastError: 'Não foi possível salvar o ajuste.' }));
    },
    setRecordMode: (recordMode) => {
      set((s) => ({ recordMode, cameras: s.cameras.map((c) => ({ ...c, recordMode })) }));
      get().remote?.updateSettings({ record_mode: recordMode }).catch(() => set({ lastError: 'Não foi possível salvar o ajuste.' }));
    },
    toggleSwitch: (k) => {
      const next = !get().switches[k];
      set((s) => ({ switches: { ...s.switches, [k]: next } }));
      const patch = k === 'wifiOnly' ? { wifi_only: next } : k === 'notifyMotion' ? { notify_motion: next } : { retention_days: next ? 30 : null };
      get().remote?.updateSettings(patch).catch(() => set({ lastError: 'Não foi possível salvar o ajuste.' }));
    },
    setHomeLayout: (homeLayout) => set({ homeLayout }),

    tickUploads: () => {
      const s = get();
      if (s.mode !== 'demo' || !s.cloud || !s.recordings.some((r) => r.status === 'uploading')) return;
      set({
        recordings: s.recordings.map((r) => {
          if (r.status !== 'uploading') return r;
          const p = Math.min(100, r.uploadProgress + 1);
          return p >= 100 ? { ...r, uploadProgress: 100, status: 'done', provider: s.cloud ?? undefined } : { ...r, uploadProgress: p };
        }),
      });
    },
    setUploadProgress: (id, progress) =>
      set((s) => ({
        recordings: s.recordings.map((r) => (r.id === id && r.status === 'uploading' ? { ...r, uploadProgress: Math.max(r.uploadProgress, Math.min(progress, 99)) } : r)),
      })),

    linkCloud: async (command) => {
      const r = get().remote;
      if (!r) return;
      // trocar o código, criar a pasta e ler a cota leva alguns segundos
      await r.send(command, 60_000);
      set((s) => ({ cloud: command.provider, cloudDialog: { ...s.cloudDialog, open: false } }));
    },

    retryUpload: (id) => {
      set((s) => ({ recordings: s.recordings.map((r) => (r.id === id ? { ...r, status: 'uploading', uploadProgress: Math.min(r.uploadProgress, 99) } : r)) }));
      if (live()) remoteSend({ type: 'retryUpload', recordingId: id }).catch(() => undefined);
    },
    clearError: () => set({ lastError: null }),

    simulate: (patch) => set(patch),
    reset: () => set(demoData()),
  };
});

/** Câmeras gravando agora. */
export const selectRecordingCount = (s: AppState) => s.cameras.filter((c) => c.recording).length;

/** Dados da nuvem ativa para a interface: nomes fixos + cota real (hub) ou simulada. */
export function useCloudInfo() {
  const cloud = useAppStore((s) => s.cloud);
  const status = useAppStore((s) => s.cloudStatus);
  if (!cloud) return null;
  const p = PROVIDERS[cloud];
  if (!status) return { ...p };
  return {
    ...p,
    account: status.account ?? p.account,
    usedBytes: status.usedBytes,
    totalBytes: status.totalBytes ?? null,
    folder: status.folderRef ?? p.folder,
  };
}
