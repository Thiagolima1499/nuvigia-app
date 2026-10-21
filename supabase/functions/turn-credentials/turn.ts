// Credenciais temporárias de TURN no formato "REST API" do coturn (use-auth-secret):
// usuário = "<expira-em-segundos>:<id>", senha = base64(HMAC-SHA1(segredo, usuário)).
export type IceServer = { urls: string[]; username?: string; credential?: string };

export async function turnCredentials(secret: string, userId: string, ttlSec: number, nowMs = Date.now()) {
  const username = `${Math.floor(nowMs / 1000) + ttlSec}:${userId}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(username));
  const credential = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return { username, credential };
}

export function splitUrls(v: string | undefined | null): string[] {
  return (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function iceServers(env: { TURN_SECRET?: string; TURN_URLS?: string; STUN_URLS?: string }, userId: string, ttlSec: number, nowMs = Date.now()) {
  const stun = splitUrls(env.STUN_URLS ?? 'stun:stun.l.google.com:19302,stun:stun.cloudflare.com:3478');
  const servers: IceServer[] = stun.length ? [{ urls: stun }] : [];
  const turn = splitUrls(env.TURN_URLS);
  if (env.TURN_SECRET && turn.length) servers.push({ urls: turn, ...(await turnCredentials(env.TURN_SECRET, userId, ttlSec, nowMs)) });
  return servers;
}
