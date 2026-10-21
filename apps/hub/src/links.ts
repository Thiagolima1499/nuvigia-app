import { createHmac, timingSafeEqual } from 'node:crypto';

export type LinkKind = 'hls' | 'file';
export type LinkClaims = { k: LinkKind; id: string; exp: number };

/**
 * Endereços temporários assinados (HMAC-SHA256) para o túnel: HLS de uma câmera
 * ou o arquivo de uma gravação. Sem o token certo, a página do hub não serve nada.
 */
export class LinkSigner {
  private key: Buffer;

  constructor(secretKey: Buffer) {
    // chave própria para links, derivada da chave do cofre
    this.key = createHmac('sha256', secretKey).update('nuvigia-links-v1').digest();
  }

  sign(kind: LinkKind, id: string, ttlSec: number, now = Date.now()): { token: string; expiresAt: string } {
    const claims: LinkClaims = { k: kind, id, exp: Math.floor(now / 1000) + ttlSec };
    const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const mac = createHmac('sha256', this.key).update(body).digest('base64url');
    return { token: `${body}.${mac}`, expiresAt: new Date(claims.exp * 1000).toISOString() };
  }

  verify(token: string, kind: LinkKind, now = Date.now()): LinkClaims | null {
    const [body, mac] = token.split('.');
    if (!body || !mac) return null;
    const expected = createHmac('sha256', this.key).update(body).digest();
    const got = Buffer.from(mac, 'base64url');
    if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
    try {
      const claims = JSON.parse(Buffer.from(body, 'base64url').toString()) as LinkClaims;
      if (claims.k !== kind || typeof claims.id !== 'string' || claims.exp * 1000 < now) return null;
      return claims;
    } catch {
      return null;
    }
  }
}
