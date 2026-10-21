import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

import type { ConnectCloud } from '../cloud';
import type { TokenStore } from './oauth';
import { AuthExpiredError, classify, deleteFilesBefore, TransientError, type CloudProvider, type FetchLike, type UploadInput } from './provider';

export type CloudKitConfig = { container: string; apiToken: string; environment: 'development' | 'production' };
export type CloudKitToken = { webAuthToken: string };

const BASE = 'https://api.apple-cloudkit.com/database/1';
/** Tipo de registro no banco privado (criar no CloudKit Console: campos file=Asset, path, name, day=String). */
export const CLIP_RECORD = 'Clip';

type CkError = { serverErrorCode?: string; reason?: string };

/**
 * iCloud pelo CloudKit Web Services, banco **privado** do container (conta na cota
 * do iCloud da pessoa). O hub guarda só o `ckWebAuthToken`, cifrado.
 * Limites: não há pastas (o caminho vira um campo do registro) e o CloudKit não
 * informa o espaço livre, então a cota mostra só o que o Nuvigia ocupa.
 */
export class ICloud implements CloudProvider {
  readonly id = 'icloud' as const;

  constructor(
    private readonly cfg: CloudKitConfig,
    private readonly tokens: TokenStore<CloudKitToken>,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  private url(database: 'public' | 'private', path: string) {
    const t = this.tokens.get();
    if (!t) throw new AuthExpiredError('icloud');
    const qs = new URLSearchParams({ ckAPIToken: this.cfg.apiToken, ckWebAuthToken: t.webAuthToken });
    return `${BASE}/${encodeURIComponent(this.cfg.container)}/${this.cfg.environment}/${database}/${path}?${qs.toString()}`;
  }

  private async call<T>(database: 'public' | 'private', path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(this.url(database, path), body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    } catch (e) {
      throw new TransientError(`icloud: ${(e as Error).message}`);
    }
    // o CloudKit pode devolver um token renovado; guardamos para os próximos pedidos
    const rotated = res.headers.get('x-apple-cloudkit-web-auth-token');
    if (rotated) this.tokens.set({ webAuthToken: rotated });
    if (res.status === 421) throw new AuthExpiredError('icloud');
    if (!res.ok) throw classify('icloud', res.status, await res.text().catch(() => ''));
    return (await res.json()) as T;
  }

  async connect(input: ConnectCloud) {
    if (!input.ckWebAuthToken) throw new Error('icloud: login incompleto');
    if (!this.cfg.apiToken) throw new Error('icloud: CLOUDKIT_API_TOKEN não configurado no hub');
    this.tokens.set({ webAuthToken: input.ckWebAuthToken });
    const me = await this.call<{ userRecordName?: string; emailAddress?: string; firstName?: string; lastName?: string }>('public', 'users/caller');
    const name = [me.firstName, me.lastName].filter(Boolean).join(' ');
    return { account: me.emailAddress ?? (name || 'Conta Apple') };
  }

  async ensureFolder(path: string[]) {
    return path.join('/');
  }

  async uploadResumable(u: UploadInput): Promise<string> {
    const recordName = randomUUID();
    const tokens = await this.call<{ tokens: { url: string }[] }>('private', 'assets/upload', {
      tokens: [{ recordType: CLIP_RECORD, recordName, fieldName: 'file' }],
    });
    const uploadUrl = tokens.tokens[0]?.url;
    if (!uploadUrl) throw new TransientError('icloud: sem endereço de envio');

    u.onProgress?.(0, u.size);
    const data = await readFile(u.filePath);
    let res: Response;
    try {
      res = await this.fetchImpl(uploadUrl, { method: 'POST', headers: { 'content-type': u.mimeType }, body: new Uint8Array(data) });
    } catch (e) {
      throw new TransientError(`icloud: ${(e as Error).message}`);
    }
    if (!res.ok) throw classify('icloud', res.status, await res.text().catch(() => ''));
    const { singleFile } = (await res.json()) as { singleFile?: unknown };
    if (!singleFile) throw new TransientError('icloud: envio sem recibo');

    const day = /\d{4}-\d{2}-\d{2}/.exec(u.folderRef)?.[0] ?? '';
    const out = await this.call<{ records: (CkError & { recordName?: string })[] }>('private', 'records/modify', {
      operations: [
        {
          operationType: 'create',
          record: {
            recordType: CLIP_RECORD,
            recordName,
            fields: { file: { value: singleFile }, path: { value: u.folderRef }, name: { value: u.name }, day: { value: day } },
          },
        },
      ],
    });
    const rec = out.records[0];
    if (!rec || rec.serverErrorCode) throw ckError(rec);
    u.onProgress?.(u.size, u.size);
    return recordName;
  }

  async deleteFile(ref: string) {
    const out = await this.call<{ records: CkError[] }>('private', 'records/modify', { operations: [{ operationType: 'forceDelete', record: { recordName: ref } }] });
    const rec = out.records[0];
    if (rec?.serverErrorCode && rec.serverErrorCode !== 'NOT_FOUND') throw ckError(rec);
  }

  deleteOlderThan(cutoff: Date, files: { ref: string; startedAt: string }[]) {
    return deleteFilesBefore(this, cutoff, files);
  }

  /** O CloudKit não expõe a cota do iCloud: o uploader soma o que o Nuvigia enviou. */
  async getQuota() {
    return { usedBytes: null, totalBytes: null };
  }
}

function ckError(rec: CkError | undefined) {
  const code = rec?.serverErrorCode ?? 'UNKNOWN';
  if (code === 'AUTHENTICATION_REQUIRED' || code === 'AUTHENTICATION_FAILED') return new AuthExpiredError('icloud');
  if (code === 'THROTTLED' || code === 'TRY_AGAIN_LATER' || code === 'INTERNAL_ERROR') return new TransientError(`icloud: ${code}`);
  if (code === 'QUOTA_EXCEEDED') return new Error('icloud: sem espaço no iCloud');
  return new Error(`icloud: ${code} ${rec?.reason ?? ''}`.trim());
}
