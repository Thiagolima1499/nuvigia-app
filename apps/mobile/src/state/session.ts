import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

export type SessionState = {
  /** 'checking' até ler a sessão salva. */
  status: 'checking' | 'signedOut' | 'signedIn';
  session: Session | null;
  /** Hub vinculado à conta (o primeiro; o app trabalha com um hub por vez). */
  hubId: string | null;
  hubsLoaded: boolean;
  set: (patch: Partial<Omit<SessionState, 'set'>>) => void;
};

export const useSession = create<SessionState>()((set) => ({
  status: 'checking',
  session: null,
  hubId: null,
  hubsLoaded: false,
  set: (patch) => set(patch),
}));
