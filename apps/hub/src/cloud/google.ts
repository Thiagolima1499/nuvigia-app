import type { ConnectCloud } from '../cloud';
import { OAuthSession, tokenRequest, type OAuthToken, type TokenStore } from './oauth';
import { classify, deleteFilesBefore, readAt, TransientError, type CloudProvider, type FetchLike, type UploadInput } from './provider';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER = 'application/vnd.google-apps.folder';
/** Partes múltiplas de 256 KiB, como a API pede. */
export const GOOGLE_CHUNK = 8 * 1024 * 1024;

const q = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/** Google Drive v3 com escopo `drive.file` (o app só enxerga o que ele mesmo criou). */
export class GoogleDrive implements CloudProvider {
  readonly id = 'google' as const;
  private session: OAuthSession;
  private folders = new Map<string, string>();

  constructor(
    private readonly tokens: TokenStore<OAuthToken>,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly chunkSize = GOOGLE_CHUNK,
  ) {
    this.session = new OAuthSession('google', TOKEN_URL, tokens, fetchImpl);
  }

  async connect(input: ConnectCloud) {
    if (!input.code || !input.codeVerifier || !input.redirectUri || !input.clientId) throw new Error('google: login incompleto');
    const t = await tokenRequest(
      'google',
      TOKEN_URL,
      { grant_type: 'authorization_code', code: input.code, code_verifier: input.codeVerifier, redirect_uri: input.redirectUri, client_id: input.clientId },
      this.fetchImpl,
    );
    this.tokens.set(t);
    this.folders.clear();
    const about = await this.json<{ user?: { emailAddress?: string } }>(`${API}/about?fields=user(emailAddress)`);
    return { account: about.user?.emailAddress ?? null };
  }

  private async json<T>(url: string, init: RequestInit = {}): Promise<T> {
    const res = await this.session.fetch(url, init);
    if (!res.ok) throw classify('google', res.status, await res.text().catch(() => ''));
    return (await res.json()) as T;
  }

  async ensureFolder(path: string[]): Promise<string> {
    let parent = 'root';
    let key = '';
    for (const name of path) {
      key += `/${name}`;
      const cached = this.folders.get(key);
      if (cached) {
        parent = cached;
        continue;
      }
      const query = `name = '${q(name)}' and mimeType = '${FOLDER}' and '${q(parent)}' in parents and trashed = false`;
      const found = await this.json<{ files: { id: string }[] }>(`${API}/files?q=${encodeURIComponent(query)}&fields=files(id)&spaces=drive`);
      const id =
        found.files[0]?.id ??
        (await this.json<{ id: string }>(`${API}/files?fields=id`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name, mimeType: FOLDER, parents: [parent] }),
        })).id;
      this.folders.set(key, id);
      parent = id;
    }
    return parent;
  }

  async uploadResumable(u: UploadInput): Promise<string> {
    const start = await this.session.fetch(`${UPLOAD}?uploadType=resumable&fields=id`, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-type': u.mimeType, 'x-upload-content-length': String(u.size) },
      body: JSON.stringify({ name: u.name, parents: [u.folderRef] }),
    });
    if (!start.ok) throw classify('google', start.status, await start.text().catch(() => ''));
    const sessionUrl = start.headers.get('location');
    if (!sessionUrl) throw new TransientError('google: sem sessão de envio');

    let offset = 0;
    let failures = 0;
    for (;;) {
      const data = await readAt(u.filePath, offset, Math.min(this.chunkSize, u.size - offset));
      const end = offset + data.length - 1;
      let res: Response | null = null;
      try {
        res = await this.put(sessionUrl, data, `bytes ${offset}-${end}/${u.size}`);
      } catch (e) {
        if (!(e instanceof TransientError)) throw e;
      }
      if (res?.status === 308) {
        const before = offset;
        offset = nextOffset(res.headers.get('range'));
        if (offset <= before && ++failures > 3) throw new TransientError('google: o servidor não aceitou a parte');
        u.onProgress?.(offset, u.size);
        continue;
      }
      if (res?.ok) {
        u.onProgress?.(u.size, u.size);
        return ((await res.json()) as { id: string }).id;
      }
      if (res && res.status < 500 && res.status !== 429) throw classify('google', res.status, await res.text().catch(() => ''));
      // falhou no meio: pergunta ao servidor até onde chegou e continua de lá
      if (++failures > 3) throw new TransientError('google: envio interrompido');
      offset = await this.status(sessionUrl, u.size);
    }
  }

  private async put(url: string, data: Buffer, range: string) {
    try {
      return await this.fetchImpl(url, { method: 'PUT', headers: { 'content-length': String(data.length), 'content-range': range }, body: new Uint8Array(data) });
    } catch (e) {
      throw new TransientError(`google: ${(e as Error).message}`);
    }
  }

  private async status(url: string, size: number): Promise<number> {
    const res = await this.fetchImpl(url, { method: 'PUT', headers: { 'content-range': `bytes */${size}` } }).catch(() => null);
    if (!res) throw new TransientError('google: sem conexão');
    if (res.status === 308) return nextOffset(res.headers.get('range'));
    if (res.status === 404 || res.status === 410) throw new TransientError('google: sessão de envio expirou');
    throw classify('google', res.status, await res.text().catch(() => ''));
  }

  async deleteFile(ref: string) {
    const res = await this.session.fetch(`${API}/files/${encodeURIComponent(ref)}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw classify('google', res.status, await res.text().catch(() => ''));
  }

  deleteOlderThan(cutoff: Date, files: { ref: string; startedAt: string }[]) {
    return deleteFilesBefore(this, cutoff, files);
  }

  async getQuota() {
    const about = await this.json<{ storageQuota?: { usage?: string; limit?: string } }>(`${API}/about?fields=storageQuota`);
    const used = Number(about.storageQuota?.usage);
    const limit = Number(about.storageQuota?.limit);
    return { usedBytes: Number.isFinite(used) ? used : null, totalBytes: Number.isFinite(limit) && limit > 0 ? limit : null };
  }
}

/** Header `Range: bytes=0-1234` → próximo byte a enviar (sem header: nada foi guardado). */
function nextOffset(range: string | null) {
  const m = range ? /bytes=0-(\d+)/.exec(range) : null;
  return m ? Number(m[1]) + 1 : 0;
}
