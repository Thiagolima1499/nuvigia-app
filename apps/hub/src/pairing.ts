import { pairingUrl } from '@nuvigia/shared';
import type { Logger } from 'pino';
import QRCode from 'qrcode';

import type { Backend } from './backend';

export type PairingState =
  | { status: 'checking' }
  | { status: 'waiting'; code: string; expiresAt: string; url: string }
  | { status: 'paired' }
  | { status: 'error'; message: string };

type Timers = { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout };

const POLL_MS = 5_000;
/** Gera um código novo um pouco antes de o atual vencer. */
const RENEW_BEFORE_MS = 30_000;

/**
 * Enquanto o hub não tem dono, mantém um código de 6 dígitos válido (10 min, uso único)
 * e mostra no terminal e na página local. Para assim que alguém parear.
 */
export class Pairing {
  state: PairingState = { status: 'checking' };
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private listeners = new Set<(s: PairingState) => void>();

  constructor(
    private readonly backend: Backend,
    private readonly log: Logger,
    private readonly opts: { printQr?: boolean; now?: () => number; timers?: Timers } = {},
  ) {}

  onChange(l: (s: PairingState) => void) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  /** Resolve quando o hub tiver dono (na hora, se já tiver). */
  async start(): Promise<void> {
    this.stopped = false;
    return new Promise((resolve) => {
      const off = this.onChange((s) => {
        if (s.status === 'paired') {
          off();
          resolve();
        }
      });
      void this.tick();
    });
  }

  stop() {
    this.stopped = true;
    if (this.timer) (this.opts.timers?.clearTimeout ?? clearTimeout)(this.timer);
    this.timer = null;
  }

  private set(s: PairingState) {
    this.state = s;
    this.listeners.forEach((l) => l(s));
  }

  private schedule(ms: number) {
    if (this.stopped) return;
    this.timer = (this.opts.timers?.setTimeout ?? setTimeout)(() => void this.tick(), ms);
  }

  private async tick() {
    if (this.stopped) return;
    const now = this.opts.now?.() ?? Date.now();
    try {
      const owner = await this.backend.getOwnerId();
      if (owner) {
        if (this.state.status !== 'paired') this.log.info('hub pareado com uma conta');
        this.set({ status: 'paired' });
        return;
      }
      const current = this.state.status === 'waiting' ? this.state : null;
      if (!current || Date.parse(current.expiresAt) - now <= RENEW_BEFORE_MS) {
        const { code, expiresAt } = await this.backend.createPairingCode();
        this.set({ status: 'waiting', code, expiresAt, url: pairingUrl(code) });
        await this.print(code);
      }
      this.schedule(POLL_MS);
    } catch (e) {
      this.log.warn({ err: e }, 'pareamento: falha ao consultar o Supabase');
      this.set({ status: 'error', message: (e as Error).message });
      this.schedule(POLL_MS * 2);
    }
  }

  private async print(code: string) {
    if (this.opts.printQr === false) return;
    const qr = await QRCode.toString(pairingUrl(code), { type: 'terminal', small: true });
    const pretty = `${code.slice(0, 3)} ${code.slice(3)}`;
    process.stdout.write(`\nPara parear, abra o app Nuvigia e leia o QR ou digite o código ${pretty} (vale 10 minutos)\n${qr}\n`);
  }
}

/** QR em SVG para a página local. */
export const pairingQrSvg = (code: string) => QRCode.toString(pairingUrl(code), { type: 'svg', margin: 1, width: 240 });
