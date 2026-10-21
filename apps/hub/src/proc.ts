import { spawn as nodeSpawn } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';

/** O mínimo de um processo filho que o hub usa (facilita testes com processos falsos). */
export interface Proc {
  stdout: Readable | null;
  stderr: Readable | null;
  stdin: Writable | null;
  kill(signal?: NodeJS.Signals): boolean;
  once(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  once(event: 'error', listener: (err: Error) => void): this;
}

export type Spawn = (cmd: string, args: string[]) => Proc;

export const spawnProcess: Spawn = (cmd, args) => nodeSpawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });

/** Espera o processo terminar e devolve o código de saída. */
export function waitExit(p: Proc): Promise<number | null> {
  return new Promise((resolve) => {
    p.once('exit', (code) => resolve(code));
    p.once('error', () => resolve(-1));
  });
}

/** Guarda as últimas linhas do stderr (mensagem de erro do ffmpeg). */
export function tailStderr(p: Proc, max = 2000): () => string {
  let buf = '';
  p.stderr?.on('data', (d: Buffer) => {
    buf = (buf + d.toString()).slice(-max);
  });
  return () => buf;
}
