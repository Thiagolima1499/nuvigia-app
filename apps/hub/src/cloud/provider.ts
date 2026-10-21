import type { CloudProviderId } from '@nuvigia/shared';

import type { ConnectCloud } from '../cloud';

export type FetchLike = typeof fetch;

export type UploadInput = {
  filePath: string;
  size: number;
  folderRef: string;
  name: string;
  mimeType: string;
  onProgress?: (sentBytes: number, totalBytes: number) => void;
};

export type Quota = {
  /** `null` quando o provedor não informa (o hub soma o que o Nuvigia enviou). */
  usedBytes: number | null;
  totalBytes: number | null;
};

/**
 * Contrato comum dos provedores (README › Provedores de nuvem). Os testes de
 * contrato em `__tests__/cloud.test.ts` rodam o mesmo roteiro contra os três.
 */
export interface CloudProvider {
  readonly id: CloudProviderId;
  /** Troca o resultado do login feito no app por tokens guardados no hub. Devolve a conta. */
  connect(input: ConnectCloud): Promise<{ account: string | null }>;
  /** Garante a pasta (ex.: ["Nuvigia", "Portão", "2026-10-21"]) e devolve a referência dela. */
  ensureFolder(path: string[]): Promise<string>;
  /** Envia o arquivo em partes, com retomada de partes que falharem. Devolve a referência do arquivo. */
  uploadResumable(input: UploadInput): Promise<string>;
  /** Apaga um arquivo enviado antes (retenção). Arquivo já inexistente não é erro. */
  deleteFile(ref: string): Promise<void>;
  /**
   * Apaga do provedor os arquivos com data anterior a `cutoff`. A lista vem do
   * Supabase (`recordings.cloud_file_ref`), então funciona igual nos três provedores.
   */
  deleteOlderThan(cutoff: Date, files: { ref: string; startedAt: string }[]): Promise<string[]>;
  getQuota(): Promise<Quota>;
  /** Endereço para a pessoa abrir o arquivo no site/app do provedor (null se não houver). */
  webLink(ref: string): Promise<string | null>;
}

/** Erro que vale tentar de novo mais tarde (rede, 429, 5xx). */
export class TransientError extends Error {}
/** O login venceu ou foi revogado: só resolve conectando de novo. */
export class AuthExpiredError extends Error {
  constructor(provider: string) {
    super(`${provider}: login expirado`);
  }
}

export function classify(provider: string, status: number, detail: string): Error {
  if (status === 401 || status === 403) return new AuthExpiredError(provider);
  if (status === 408 || status === 429 || status >= 500) return new TransientError(`${provider}: ${status} ${detail.slice(0, 120)}`);
  return new Error(`${provider}: ${status} ${detail.slice(0, 200)}`);
}

/** Implementação padrão de deleteOlderThan: apaga um por um os que passaram da data. */
export async function deleteFilesBefore(p: Pick<CloudProvider, 'deleteFile'>, cutoff: Date, files: { ref: string; startedAt: string }[]) {
  const removed: string[] = [];
  for (const f of files) {
    if (Date.parse(f.startedAt) >= cutoff.getTime()) continue;
    await p.deleteFile(f.ref);
    removed.push(f.ref);
  }
  return removed;
}

/** Lê `len` bytes do arquivo a partir de `offset`. */
export async function readAt(path: string, offset: number, len: number): Promise<Buffer> {
  const { open } = await import('node:fs/promises');
  const fh = await open(path, 'r');
  try {
    const buf = Buffer.alloc(len);
    const { bytesRead } = await fh.read(buf, 0, len, offset);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

/** Nomes de pasta seguros para os três provedores. */
export function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|#%]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Câmera';
}
