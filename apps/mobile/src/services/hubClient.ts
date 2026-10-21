import { BroadcastEvent, HubEvent, hubTopic, type CommandResult, type HubCommand } from '@nuvigia/shared';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

type Listener = (event: HubEvent) => void;
type SignalListener = (msg: unknown) => void;

const COMMAND_TIMEOUT_MS = 15_000;

/**
 * Conversa com o hub pelo canal privado `hub:<id>` do Supabase Realtime.
 * Comandos têm `requestId` e esperam `command_result`; eventos do hub chegam em `hub_event`.
 */
export class HubClient {
  private channel: RealtimeChannel | null = null;
  private pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private listeners = new Set<Listener>();
  private signalListeners = new Set<SignalListener>();
  private ready: Promise<void> | null = null;

  constructor(
    private readonly supabase: SupabaseClient,
    readonly hubId: string,
  ) {}

  connect(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      const ch = this.supabase.channel(hubTopic(this.hubId), { config: { private: true, broadcast: { self: false } } });
      ch.on('broadcast', { event: BroadcastEvent.commandResult }, ({ payload }) => this.onResult(payload as CommandResult));
      ch.on('broadcast', { event: BroadcastEvent.event }, ({ payload }) => {
        const parsed = HubEvent.safeParse(payload);
        if (parsed.success) this.listeners.forEach((l) => l(parsed.data));
      });
      ch.on('broadcast', { event: BroadcastEvent.signal }, ({ payload }) => this.signalListeners.forEach((l) => l(payload)));
      ch.subscribe((status, err) => {
        if (status === 'SUBSCRIBED') resolve();
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this.ready = null;
          reject(err ?? new Error(`realtime: ${status}`));
        }
      });
      this.channel = ch;
    });
    return this.ready;
  }

  async send<T = unknown>(command: HubCommand, timeoutMs = COMMAND_TIMEOUT_MS): Promise<T> {
    await this.connect();
    const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const result = new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('hub_timeout'));
      }, timeoutMs);
      this.pending.set(requestId, { resolve: resolve as (v: unknown) => void, reject, timer });
    });
    await this.channel!.send({ type: 'broadcast', event: BroadcastEvent.command, payload: { requestId, command } });
    return result;
  }

  async signal(payload: unknown): Promise<void> {
    await this.connect();
    await this.channel!.send({ type: 'broadcast', event: BroadcastEvent.signal, payload });
  }

  onEvent(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  onSignal(l: SignalListener): () => void {
    this.signalListeners.add(l);
    return () => this.signalListeners.delete(l);
  }

  async close(): Promise<void> {
    this.pending.forEach((p) => {
      clearTimeout(p.timer);
      p.reject(new Error('closed'));
    });
    this.pending.clear();
    if (this.channel) await this.supabase.removeChannel(this.channel);
    this.channel = null;
    this.ready = null;
  }

  private onResult(r: CommandResult) {
    const p = this.pending.get(r.requestId);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(r.requestId);
    if (r.ok) p.resolve(r.data);
    else p.reject(new Error(r.error));
  }
}
