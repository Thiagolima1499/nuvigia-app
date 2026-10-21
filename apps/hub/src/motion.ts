import { EventEmitter } from 'node:events';

import type { Proc, Spawn } from './proc';

export const MOTION_W = 64;
export const MOTION_H = 36;
/** Diferença mínima de brilho (0–255) para um pixel contar como "mudou". */
const PIXEL_DELTA = 25;

/** Fração dos pixels que mudaram entre dois quadros em tons de cinza. */
export function frameDiff(a: Uint8Array, b: Uint8Array, pixelDelta = PIXEL_DELTA): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let changed = 0;
  for (let i = 0; i < n; i++) {
    if (Math.abs(a[i]! - b[i]!) > pixelDelta) changed++;
  }
  return changed / n;
}

/**
 * Lógica de decisão, sem processo: dois quadros seguidos acima do limiar
 * disparam movimento, depois espera `cooldownMs` antes de disparar de novo.
 */
export class MotionGate {
  private prev: Uint8Array | null = null;
  private hits = 0;
  private lastFired = -Infinity;

  constructor(
    private readonly sensitivity: number,
    private readonly cooldownMs: number,
    private readonly hitsNeeded = 2,
  ) {}

  push(frame: Uint8Array, now: number): boolean {
    const prev = this.prev;
    this.prev = frame;
    if (!prev) return false;
    const diff = frameDiff(prev, frame);
    this.hits = diff >= this.sensitivity ? this.hits + 1 : 0;
    if (this.hits >= this.hitsNeeded && now - this.lastFired >= this.cooldownMs) {
      this.lastFired = now;
      this.hits = 0;
      return true;
    }
    return false;
  }
}

/**
 * Detector por imagem: o ffmpeg lê o RTSP local do go2rtc, reduz para 64×36 em cinza
 * a 2 quadros por segundo e o hub compara quadro a quadro. Barato o bastante para um Raspberry Pi.
 */
export class MotionDetector extends EventEmitter {
  private proc: Proc | null = null;
  private stopped = true;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private gate: MotionGate;

  constructor(
    private readonly src: string,
    private readonly spawn: Spawn,
    private readonly ffmpeg: string,
    sensitivity: number,
    cooldownMs: number,
    private readonly now: () => number = Date.now,
  ) {
    super();
    this.gate = new MotionGate(sensitivity, cooldownMs);
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.run();
  }

  stop() {
    this.stopped = true;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.proc?.kill('SIGTERM');
    this.proc = null;
  }

  private run() {
    const args = ['-hide_banner', '-loglevel', 'error', '-rtsp_transport', 'tcp', '-i', this.src, '-an', '-vf', `fps=2,scale=${MOTION_W}:${MOTION_H},format=gray`, '-f', 'rawvideo', 'pipe:1'];
    const p = this.spawn(this.ffmpeg, args);
    this.proc = p;
    const size = MOTION_W * MOTION_H;
    let pending = Buffer.alloc(0);
    p.stdout?.on('data', (chunk: Buffer) => {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= size) {
        const frame = new Uint8Array(pending.subarray(0, size));
        pending = pending.subarray(size);
        if (this.gate.push(frame, this.now())) this.emit('motion');
      }
    });
    p.once('exit', () => {
      this.proc = null;
      if (!this.stopped) this.restartTimer = setTimeout(() => this.run(), 5000);
    });
    p.once('error', () => undefined);
  }
}
