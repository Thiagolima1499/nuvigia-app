import { AuthExpiredError, classify, TransientError, type FetchLike } from './provider';

export type OAuthToken = {
  accessToken: string;
  refreshToken: string;
  /** epoch ms */
  expiresAt: number;
  clientId: string;
};

export type TokenStore<T> = { get(): T | null; set(t: T): void };

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };

/** Troca código (PKCE) ou refresh token no endpoint de token do provedor. */
export async function tokenRequest(provider: string, url: string, params: Record<string, string>, fetchImpl: FetchLike, previous?: OAuthToken): Promise<OAuthToken> {
  let res: Response;
  try {
    res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() });
  } catch (e) {
    throw new TransientError(`${provider}: ${(e as Error).message}`);
  }
  const body = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !body.access_token) {
    if (body.error === 'invalid_grant') throw new AuthExpiredError(provider);
    throw classify(provider, res.status, body.error_description ?? body.error ?? '');
  }
  const refreshToken = body.refresh_token ?? previous?.refreshToken;
  if (!refreshToken) throw new Error(`${provider}: sem refresh token (falta acesso offline)`);
  return {
    accessToken: body.access_token,
    refreshToken,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
    clientId: params.client_id ?? previous?.clientId ?? '',
  };
}

/**
 * Guarda o token e renova sozinho um minuto antes de vencer.
 * Pedidos simultâneos esperam a mesma renovação.
 */
export class OAuthSession {
  private refreshing: Promise<OAuthToken> | null = null;

  constructor(
    private readonly provider: string,
    private readonly tokenUrl: string,
    private readonly store: TokenStore<OAuthToken>,
    private readonly fetchImpl: FetchLike,
    private readonly extra: Record<string, string> = {},
  ) {}

  async accessToken(force = false): Promise<string> {
    const t = this.store.get();
    if (!t) throw new AuthExpiredError(this.provider);
    if (!force && t.expiresAt - Date.now() > 60_000) return t.accessToken;
    this.refreshing ??= tokenRequest(this.provider, this.tokenUrl, { grant_type: 'refresh_token', refresh_token: t.refreshToken, client_id: t.clientId, ...this.extra }, this.fetchImpl, t)
      .then((nt) => {
        this.store.set(nt);
        return nt;
      })
      .finally(() => (this.refreshing = null));
    return (await this.refreshing).accessToken;
  }

  /** fetch com Authorization; se der 401, renova uma vez e tenta de novo. */
  async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    const go = async (force: boolean) => {
      const token = await this.accessToken(force);
      try {
        return await this.fetchImpl(url, { ...init, headers: { ...(init.headers as Record<string, string>), authorization: `Bearer ${token}` } });
      } catch (e) {
        throw new TransientError(`${this.provider}: ${(e as Error).message}`);
      }
    };
    const res = await go(false);
    return res.status === 401 ? go(true) : res;
  }
}
