import type { CameraRow, SettingsRow } from '@nuvigia/shared';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

export type DbHandlers = {
  onSettings: (s: SettingsRow) => void;
  onCameraUpdated: (c: CameraRow) => void;
  onCameraDeleted: (id: string) => void;
  onRecordingDeleted: (id: string) => void;
};

/** Mudanças feitas pelo app direto no banco (ajustes, nome da câmera, gravação apagada). */
export function watchDb(supabase: SupabaseClient, hubId: string, h: DbHandlers): () => Promise<void> {
  const filter = `hub_id=eq.${hubId}`;
  const ch: RealtimeChannel = supabase
    .channel(`hubdb:${hubId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'settings', filter }, (p) => h.onSettings(p.new as SettingsRow))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'cameras', filter }, (p) => h.onCameraUpdated(p.new as CameraRow))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'cameras' }, (p) => {
      const id = (p.old as { id?: string }).id;
      if (id) h.onCameraDeleted(id);
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'recordings' }, (p) => {
      const id = (p.old as { id?: string }).id;
      if (id) h.onRecordingDeleted(id);
    })
    .subscribe();
  return async () => {
    await supabase.removeChannel(ch);
  };
}
