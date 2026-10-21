import { BroadcastEvent, CommandEnvelope, hubTopic, type CommandResult, type HubCommand, type HubEvent } from '@nuvigia/shared';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { Logger } from 'pino';

import { errorCode } from './commands';

export type CommandRunner = (cmd: HubCommand, emit: (e: HubEvent) => void) => Promise<unknown>;

/**
 * Canal privado `hub:<id>` do Supabase Realtime. Só o dono e o próprio hub
 * entram (policies em realtime.messages). Recebe `command`, responde `command_result`
 * e publica `hub_event`; `signal` fica para o ao vivo remoto.
 */
export class HubChannel {
  private channel: RealtimeChannel | null = null;
  private signalListeners = new Set<(payload: unknown) => void>();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly hubId: string,
    private readonly run: CommandRunner,
    private readonly log: Logger,
  ) {}

  start() {
    this.closed = false;
    const ch = this.supabase.channel(hubTopic(this.hubId), { config: { private: true, broadcast: { self: false, ack: false } } });
    ch.on('broadcast', { event: BroadcastEvent.command }, ({ payload }) => void this.onCommand(payload));
    ch.on('broadcast', { event: BroadcastEvent.signal }, ({ payload }) => this.signalListeners.forEach((l) => l(payload)));
    ch.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') this.log.info('canal de comandos conectado');
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        this.log.warn({ status, err: err?.message }, 'canal de comandos caiu; reconectando em 5 s');
        this.restart();
      }
    });
    this.channel = ch;
  }

  private restart() {
    if (this.closed || this.retryTimer) return;
    this.retryTimer = setTimeout(async () => {
      this.retryTimer = null;
      if (this.channel) await this.supabase.removeChannel(this.channel).catch(() => undefined);
      this.channel = null;
      if (!this.closed) this.start();
    }, 5000);
  }

  async onCommand(payload: unknown) {
    const parsed = CommandEnvelope.safeParse(payload);
    if (!parsed.success) {
      const requestId = (payload as { requestId?: unknown })?.requestId;
      if (typeof requestId === 'string') await this.reply({ requestId, ok: false, error: 'invalid_command' });
      return;
    }
    const { requestId, command } = parsed.data;
    try {
      const data = await this.run(command, (e) => void this.emit(e));
      await this.reply({ requestId, ok: true, data });
    } catch (e) {
      const error = errorCode(e);
      if (error === 'internal') this.log.error({ err: e, command: command.type }, 'comando falhou');
      await this.reply({ requestId, ok: false, error });
    }
  }

  private async send(event: string, payload: unknown) {
    if (!this.channel) return;
    await this.channel.send({ type: 'broadcast', event, payload }).catch(() => undefined);
  }

  reply(r: CommandResult) {
    return this.send(BroadcastEvent.commandResult, r);
  }

  emit(e: HubEvent) {
    return this.send(BroadcastEvent.event, e);
  }

  signal(payload: unknown) {
    return this.send(BroadcastEvent.signal, payload);
  }

  onSignal(l: (payload: unknown) => void) {
    this.signalListeners.add(l);
    return () => this.signalListeners.delete(l);
  }

  async close() {
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.channel) await this.supabase.removeChannel(this.channel).catch(() => undefined);
    this.channel = null;
  }
}
