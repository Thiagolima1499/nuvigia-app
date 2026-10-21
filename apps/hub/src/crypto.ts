import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const PREFIX = 'v1';
const IV_BYTES = 12;

/** Lê a chave de 32 bytes (base64 ou hex) do ambiente. */
export function parseKey(raw: string): Buffer {
  const trimmed = raw.trim();
  const key = /^[0-9a-fA-F]{64}$/.test(trimmed) ? Buffer.from(trimmed, 'hex') : Buffer.from(trimmed, 'base64');
  if (key.length !== 32) throw new Error('HUB_SECRET_KEY precisa ter 32 bytes (base64 ou hex). Gere com: openssl rand -base64 32');
  return key;
}

/** Cifra com AES-256-GCM. Formato: `v1.<iv>.<tag>.<dados>` em base64url. */
export class Secrets {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) throw new Error('chave AES-256 inválida');
  }

  encrypt(plain: string, aad = ''): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    if (aad) cipher.setAAD(Buffer.from(aad));
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [PREFIX, iv.toString('base64url'), tag.toString('base64url'), data.toString('base64url')].join('.');
  }

  decrypt(box: string, aad = ''): string {
    const [prefix, iv, tag, data] = box.split('.');
    if (prefix !== PREFIX || !iv || !tag || data === undefined) throw new Error('segredo em formato desconhecido');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    if (aad) decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  }

  encryptJson(value: unknown, aad = ''): string {
    return this.encrypt(JSON.stringify(value), aad);
  }

  decryptJson<T>(box: string, aad = ''): T {
    return JSON.parse(this.decrypt(box, aad)) as T;
  }
}
