import type { ConnectCloud } from '../cloud';
import { OAuthSession, tokenRequest, type OAuthToken, type TokenStore } from './oauth';
import { classify, deleteFilesBefore, readAt, TransientError, type CloudProvider, type FetchLike, type UploadInput } from './provider';

const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const GRAPH = 'https://graph.microsoft.com/v1.0';
export const ONEDRIVE_SCOPE = 'Files.ReadWrite.AppFolder offline_access';
/** 10 MiB, múltiplo de 320 KiB como o Graph pede. */
export const ONEDRIVE_CHUNK = 10 * 1024 * 1024;

const encPath = (parts: string[]) => parts.map(encodeURIComponent).join('/');

/**
 * OneDrive pelo Microsoft Graph, só na pasta do app (`/drive/special/approot`,
 * que aparece como OneDrive/Aplicativos/Nuvigia). Ela já é a pasta "Nuvigia".
 */
export class OneDrive implements CloudProvider {
  readonly id = 'onedrive' as const;
  private session: OAuthSession;

  constructor(
    private readonly tokens: TokenStore<OAuthToken>,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly chunkSize = ONEDRIVE_CHUNK,
  ) {
    this.session = new OAuthSession('onedrive', TOKEN_URL, tokens, fetchImpl, { scope: ONEDRIVE_SCOPE });
  }

  async connect(input: ConnectCloud) {
    if (!input.code || !input.codeVerifier || !input.redirectUri || !input.clientId) throw new Error('onedrive: login incompleto');
    const t = await tokenRequest(
      'onedrive',
      TOKEN_URL,
      { grant_type: 'authorization_code', code: input.code, code_verifier: input.codeVerifier, redirect_uri: input.redirectUri, client_id: input.clientId, scope: ONEDRIVE_SCOPE },
      this.fetchImpl,
    );
    this.tokens.set(t);
    const drive = await this.json<{ owner?: { user?: { displayName?: string; email?: string } } }>(`${GRAPH}/me/drive?$select=owner`);
    return { account: drive.owner?.user?.email ?? drive.owner?.user?.displayName ?? null };
  }

  private async json<T>(url: string, init: RequestInit = {}): Promise<T> {
    const res = await this.session.fetch(url, init);
    if (!res.ok) throw classify('onedrive', res.status, await res.text().catch(() => ''));
    return (await res.json()) as T;
  }

  /** A pasta é criada junto com o envio; aqui só montamos o caminho dentro da pasta do app. */
  async ensureFolder(path: string[]) {
    const inside = path[0] === 'Nuvigia' ? path.slice(1) : path;
    return inside.join('/');
  }

  async uploadResumable(u: UploadInput): Promise<string> {
    const target = encPath([...(u.folderRef ? u.folderRef.split('/') : []), u.name]);
    const session = await this.json<{ uploadUrl: string }>(`${GRAPH}/me/drive/special/approot:/${target}:/createUploadSession`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename' } }),
    });

    let offset = 0;
    let failures = 0;
    for (;;) {
      const data = await readAt(u.filePath, offset, Math.min(this.chunkSize, u.size - offset));
      const end = offset + data.length - 1;
      // a URL da sessão já é autorizada; não mandar o token do Graph para ela
      const res = await this.fetchImpl(session.uploadUrl, {
        method: 'PUT',
        headers: { 'content-length': String(data.length), 'content-range': `bytes ${offset}-${end}/${u.size}` },
        body: new Uint8Array(data),
      }).catch(() => null);
      if (res && (res.status === 200 || res.status === 201)) {
        u.onProgress?.(u.size, u.size);
        return ((await res.json()) as { id: string }).id;
      }
      if (res?.status === 202) {
        const body = (await res.json()) as { nextExpectedRanges?: string[] };
        offset = Number((body.nextExpectedRanges?.[0] ?? `${end + 1}-`).split('-')[0]);
        u.onProgress?.(offset, u.size);
        failures = 0;
        continue;
      }
      if (res && res.status < 500 && res.status !== 429 && res.status !== 416) throw classify('onedrive', res.status, await res.text().catch(() => ''));
      if (++failures > 3) throw new TransientError('onedrive: envio interrompido');
      offset = await this.status(session.uploadUrl);
    }
  }

  private async status(uploadUrl: string): Promise<number> {
    const res = await this.fetchImpl(uploadUrl).catch(() => null);
    if (!res) throw new TransientError('onedrive: sem conexão');
    if (res.status === 404) throw new TransientError('onedrive: sessão de envio expirou');
    const body = (await res.json().catch(() => ({}))) as { nextExpectedRanges?: string[] };
    return Number((body.nextExpectedRanges?.[0] ?? '0-').split('-')[0]);
  }

  async deleteFile(ref: string) {
    const res = await this.session.fetch(`${GRAPH}/me/drive/items/${encodeURIComponent(ref)}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw classify('onedrive', res.status, await res.text().catch(() => ''));
  }

  deleteOlderThan(cutoff: Date, files: { ref: string; startedAt: string }[]) {
    return deleteFilesBefore(this, cutoff, files);
  }

  async webLink(ref: string) {
    const item = await this.json<{ webUrl?: string }>(`${GRAPH}/me/drive/items/${encodeURIComponent(ref)}?$select=webUrl`);
    return item.webUrl ?? null;
  }

  async getQuota() {
    const d = await this.json<{ quota?: { used?: number; total?: number } }>(`${GRAPH}/me/drive?$select=quota`);
    return { usedBytes: d.quota?.used ?? null, totalBytes: d.quota?.total ?? null };
  }
}
