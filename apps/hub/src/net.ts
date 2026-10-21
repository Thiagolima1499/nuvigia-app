import { Socket } from 'node:net';

/** Testa se a câmera responde na porta RTSP (sem abrir o stream). */
export function tcpReachable(host: string, port: number, timeoutMs = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const s = new Socket();
    const done = (ok: boolean) => {
      s.destroy();
      resolve(ok);
    };
    s.setTimeout(timeoutMs);
    s.once('connect', () => done(true));
    s.once('timeout', () => done(false));
    s.once('error', () => done(false));
    s.connect(port, host);
  });
}

/** Host e porta de uma URL RTSP (porta padrão 554). */
export function rtspTarget(url: string): { host: string; port: number } | null {
  try {
    const u = new URL(url);
    return { host: u.hostname, port: u.port ? Number(u.port) : 554 };
  } catch {
    return null;
  }
}
