import {
  cameraFromRow,
  cloudStatusFromSettings,
  eventFromRow,
  recordingFromRow,
  type CameraRow,
  type EventRow,
  type HubRow,
  type RecordingRow,
  type SettingsRow,
} from '@nuvigia/shared';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

import { toUiEvent, useAppStore, type Remote } from '@/state/store';

import { HubClient } from './hubClient';

const RECORDINGS_LIMIT = 200;

/**
 * Liga o app a um hub real: carrega os dados do Supabase, assina mudanças
 * (postgres_changes) e conecta o canal de comandos. Devolve a função de desligar.
 */
export async function startSync(supabase: SupabaseClient, hubId: string): Promise<() => Promise<void>> {
  const store = useAppStore.getState();
  const hub = new HubClient(supabase, hubId);

  const remote: Remote = {
    send: (command) => hub.send(command),
    updateSettings: async (patch) => {
      const { error } = await supabase.from('settings').update(patch).eq('hub_id', hubId);
      if (error) throw error;
    },
    updateCamera: async (id, patch) => {
      const { error } = await supabase.from('cameras').update(patch).eq('id', id);
      if (error) throw error;
    },
    deleteRecording: async (id) => {
      const { error } = await supabase.from('recordings').delete().eq('id', id);
      if (error) throw error;
    },
  };
  store.attachRemote(hubId, remote);
  hubClientRef.current = hub;

  const applySettingsRow = (s: SettingsRow) =>
    useAppStore.getState().applySettings({
      quality: s.quality,
      recordMode: s.record_mode,
      wifiOnly: s.wifi_only,
      notifyMotion: s.notify_motion,
      retentionDays: s.retention_days,
      cloud: cloudStatusFromSettings(s),
    });
  const applyHub = (h: HubRow) => useAppStore.getState().setHubStatus(h.online ? 'ready' : 'unreachable');

  const since = new Date(Date.now() - 31 * 86_400_000).toISOString();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [hubRes, camRes, recRes, evRes, setRes] = await Promise.all([
    supabase.from('hubs').select('*').eq('id', hubId).single<HubRow>(),
    supabase.from('cameras').select('*').eq('hub_id', hubId).order('created_at'),
    supabase.from('recordings').select('*').eq('hub_id', hubId).gte('started_at', since).order('started_at', { ascending: false }).limit(RECORDINGS_LIMIT),
    supabase.from('events').select('*').eq('hub_id', hubId).gte('at', startOfDay.toISOString()).order('at', { ascending: false }).limit(200),
    supabase.from('settings').select('*').eq('hub_id', hubId).maybeSingle<SettingsRow>(),
  ]);
  const s = useAppStore.getState();
  if (hubRes.data) applyHub(hubRes.data);
  else s.setHubStatus('unreachable');
  s.setCameras(((camRes.data ?? []) as CameraRow[]).map(cameraFromRow));
  s.setRecordings(((recRes.data ?? []) as RecordingRow[]).map(recordingFromRow));
  s.setEvents(((evRes.data ?? []) as EventRow[]).map((e) => toUiEvent(eventFromRow(e))));
  if (setRes.data) applySettingsRow(setRes.data);

  const filter = `hub_id=eq.${hubId}`;
  const changes: RealtimeChannel = supabase
    .channel(`db:${hubId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cameras', filter }, (p) => {
      const st = useAppStore.getState();
      if (p.eventType === 'DELETE') st.removeCameraLocal((p.old as { id: string }).id);
      else st.upsertCamera(cameraFromRow(p.new as CameraRow));
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'recordings', filter }, (p) => {
      const st = useAppStore.getState();
      if (p.eventType === 'DELETE') st.removeRecordingLocal((p.old as { id: string }).id);
      else st.upsertRecording(recordingFromRow(p.new as RecordingRow));
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events', filter }, (p) => {
      useAppStore.getState().addEvent(toUiEvent(eventFromRow(p.new as EventRow)));
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'settings', filter }, (p) => {
      if (p.eventType !== 'DELETE') applySettingsRow(p.new as SettingsRow);
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'hubs', filter: `id=eq.${hubId}` }, (p) => applyHub(p.new as HubRow))
    .subscribe();

  hub.connect().catch(() => useAppStore.getState().setHubStatus('unreachable'));

  return async () => {
    await supabase.removeChannel(changes);
    await hub.close();
    hubClientRef.current = null;
    useAppStore.getState().detachRemote();
  };
}

/** Cliente do hub ativo (descoberta de câmeras e sinalização de vídeo usam diretamente). */
export const hubClientRef: { current: HubClient | null } = { current: null };
