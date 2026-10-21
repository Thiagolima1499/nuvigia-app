/** Servidores falsos (só o necessário) de Google Drive, Microsoft Graph e CloudKit. */
type Handler = (url: URL, init: RequestInit & { bodyBuf: Buffer }) => Response | Promise<Response>;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

async function toBuf(body: RequestInit['body']): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  if (typeof body === 'string') return Buffer.from(body);
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (body instanceof URLSearchParams) return Buffer.from(body.toString());
  return Buffer.from(await new Response(body as ConstructorParameters<typeof Response>[0]).arrayBuffer());
}

export abstract class FakeServer {
  files = new Map<string, { name: string; parent: string; data: Buffer }>();
  calls: string[] = [];
  /** Próximos N PUTs de bloco falham com 503 (testa retomada). */
  failNextChunks = 0;
  /** Próximo pedido autenticado devolve 401 (testa renovação). */
  expireNext = false;
  refreshes = 0;
  protected seq = 0;

  fetch: typeof fetch = (async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(input.toString());
    const bodyBuf = await toBuf(init.body);
    this.calls.push(`${init.method ?? 'GET'} ${url.host}${url.pathname}`);
    return this.handle(url, { ...init, bodyBuf });
  }) as typeof fetch;

  protected abstract handle: Handler;

  protected authorized(init: RequestInit) {
    const h = (init.headers ?? {}) as Record<string, string>;
    if (this.expireNext && h.authorization) {
      this.expireNext = false;
      return false;
    }
    return h.authorization === `Bearer access-${this.refreshes}`;
  }

  protected token(form: URLSearchParams) {
    if (form.get('grant_type') === 'refresh_token') {
      if (form.get('refresh_token') !== 'refresh-1') return json({ error: 'invalid_grant' }, 400);
      this.refreshes++;
      return json({ access_token: `access-${this.refreshes}`, expires_in: 3600 });
    }
    if (form.get('code') !== 'codigo-ok' || form.get('code_verifier') !== 'verificador') return json({ error: 'invalid_grant' }, 400);
    return json({ access_token: `access-${this.refreshes}`, refresh_token: 'refresh-1', expires_in: 3600 });
  }

  /** Recebe um bloco com Content-Range e devolve [início, fim, total]. */
  protected range(init: RequestInit): [number, number, number] {
    const h = (init.headers ?? {}) as Record<string, string>;
    const m = /bytes (\d+)-(\d+)\/(\d+)/.exec(h['content-range'] ?? '');
    if (!m) throw new Error('sem content-range');
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  }
}

export class FakeGoogle extends FakeServer {
  private sessions = new Map<string, { name: string; parent: string; data: Buffer; total: number }>();

  protected handle: Handler = (url, init) => {
    if (url.host === 'oauth2.googleapis.com') return this.token(new URLSearchParams(init.bodyBuf.toString()));
    if (url.pathname.startsWith('/upload-session/')) return this.chunk(url.pathname.split('/')[2]!, init);
    if (!this.authorized(init)) return json({ error: 'unauthorized' }, 401);
    const p = url.pathname;
    if (p === '/drive/v3/about') {
      const used = [...this.files.values()].reduce((a, f) => a + f.data.length, 0);
      return json({ user: { emailAddress: 'ana@gmail.com' }, storageQuota: { usage: String(used), limit: String(15 * 1024 ** 3) } });
    }
    if (p === '/drive/v3/files' && (init.method ?? 'GET') === 'GET') {
      const q = url.searchParams.get('q') ?? '';
      const name = /name = '([^']+)'/.exec(q)?.[1];
      const parent = /'([^']+)' in parents/.exec(q)?.[1];
      const hits = [...this.files.entries()].filter(([, f]) => f.name === name && f.parent === parent).map(([id]) => ({ id }));
      return json({ files: hits });
    }
    if (p === '/drive/v3/files' && init.method === 'POST') {
      const meta = JSON.parse(init.bodyBuf.toString()) as { name: string; parents: string[] };
      const id = `folder-${++this.seq}`;
      this.files.set(id, { name: meta.name, parent: meta.parents[0]!, data: Buffer.alloc(0) });
      return json({ id });
    }
    if (p === '/upload/drive/v3/files' && init.method === 'POST') {
      const meta = JSON.parse(init.bodyBuf.toString()) as { name: string; parents: string[] };
      const sid = `s${++this.seq}`;
      const total = Number(((init.headers ?? {}) as Record<string, string>)['x-upload-content-length']);
      this.sessions.set(sid, { name: meta.name, parent: meta.parents[0]!, data: Buffer.alloc(0), total });
      return new Response(null, { status: 200, headers: { location: `https://upload.test/upload-session/${sid}` } });
    }
    const del = /^\/drive\/v3\/files\/(.+)$/.exec(p);
    if (del && init.method === 'DELETE') return this.files.delete(decodeURIComponent(del[1]!)) ? new Response(null, { status: 204 }) : json({}, 404);
    return json({ error: `rota desconhecida ${p}` }, 400);
  };

  private chunk(sid: string, init: RequestInit & { bodyBuf: Buffer }) {
    const s = this.sessions.get(sid);
    if (!s) return json({}, 404);
    const h = (init.headers ?? {}) as Record<string, string>;
    const rangeHdr = () => (s.data.length ? { range: `bytes=0-${s.data.length - 1}` } : ({} as Record<string, string>));
    if (h['content-range']?.startsWith('bytes */')) return new Response(null, { status: 308, headers: rangeHdr() });
    if (this.failNextChunks > 0) {
      this.failNextChunks--;
      // guarda metade do bloco antes de falhar, como uma conexão que caiu no meio
      s.data = Buffer.concat([s.data, init.bodyBuf.subarray(0, Math.floor(init.bodyBuf.length / 2))]);
      return json({}, 503);
    }
    const [start, , total] = this.range(init);
    if (start !== s.data.length) return new Response(null, { status: 308, headers: rangeHdr() });
    s.data = Buffer.concat([s.data, init.bodyBuf]);
    if (s.data.length < total) return new Response(null, { status: 308, headers: rangeHdr() });
    const id = `file-${++this.seq}`;
    this.files.set(id, { name: s.name, parent: s.parent, data: s.data });
    return json({ id });
  }
}

export class FakeGraph extends FakeServer {
  private sessions = new Map<string, { path: string; data: Buffer }>();

  protected handle: Handler = (url, init) => {
    if (url.host === 'login.microsoftonline.com') {
      const form = new URLSearchParams(init.bodyBuf.toString());
      if (form.get('scope') !== 'Files.ReadWrite.AppFolder offline_access') return json({ error: 'invalid_scope' }, 400);
      return this.token(form);
    }
    if (url.host === 'upload.graph.test') return this.chunk(url.pathname.slice(1), init);
    if (!this.authorized(init)) return json({ error: 'unauthorized' }, 401);
    const p = decodeURIComponent(url.pathname);
    if (p === '/v1.0/me/drive') {
      const used = [...this.files.values()].reduce((a, f) => a + f.data.length, 0);
      return json({ owner: { user: { displayName: 'Ana Souza' } }, quota: { used, total: 5 * 1024 ** 3 } });
    }
    const up = /^\/v1\.0\/me\/drive\/special\/approot:\/(.+):\/createUploadSession$/.exec(p);
    if (up && init.method === 'POST') {
      const sid = `u${++this.seq}`;
      this.sessions.set(sid, { path: up[1]!, data: Buffer.alloc(0) });
      return json({ uploadUrl: `https://upload.graph.test/${sid}` });
    }
    const del = /^\/v1\.0\/me\/drive\/items\/(.+)$/.exec(p);
    if (del && init.method === 'DELETE') return this.files.delete(del[1]!) ? new Response(null, { status: 204 }) : json({}, 404);
    return json({ error: `rota desconhecida ${p}` }, 400);
  };

  private chunk(sid: string, init: RequestInit & { bodyBuf: Buffer }) {
    const s = this.sessions.get(sid);
    if (!s) return json({}, 404);
    if ((((init.headers ?? {}) as Record<string, string>).authorization)) return json({ error: 'não mande token para a URL de envio' }, 400);
    if (!init.method || init.method === 'GET') return json({ nextExpectedRanges: [`${s.data.length}-`] });
    if (this.failNextChunks > 0) {
      this.failNextChunks--;
      return json({}, 503);
    }
    const [start, , total] = this.range(init);
    if (start !== s.data.length) return json({ error: 'range' }, 416);
    s.data = Buffer.concat([s.data, init.bodyBuf]);
    if (s.data.length < total) return json({ nextExpectedRanges: [`${s.data.length}-`] }, 202);
    const id = `item-${++this.seq}`;
    this.files.set(id, { name: s.path, parent: '', data: s.data });
    return json({ id, name: s.path }, 201);
  }
}

export class FakeCloudKit extends FakeServer {
  private pendingAssets = new Map<string, Buffer>();
  rotateTo: string | null = null;

  protected handle: Handler = (url, init) => {
    if (url.host === 'cvws.test') {
      const id = url.pathname.slice(1);
      this.pendingAssets.set(id, init.bodyBuf);
      return json({ singleFile: { receipt: id, size: init.bodyBuf.length, fileChecksum: 'x', wrappingKey: 'k', referenceChecksum: 'r' } });
    }
    if (url.searchParams.get('ckAPIToken') !== 'api-token') return json({ serverErrorCode: 'AUTHENTICATION_FAILED' }, 401);
    if (url.searchParams.get('ckWebAuthToken') !== 'web+auth/token' && url.searchParams.get('ckWebAuthToken') !== 'girado') return json({ serverErrorCode: 'AUTHENTICATION_REQUIRED' }, 421);
    const headers: Record<string, string> = this.rotateTo ? { 'x-apple-cloudkit-web-auth-token': this.rotateTo } : {};
    const p = url.pathname;
    if (p.endsWith('/public/users/caller')) return json({ userRecordName: '_abc', firstName: 'Ana', lastName: 'Souza' }, 200, headers);
    if (p.endsWith('/private/assets/upload')) {
      const id = `asset-${++this.seq}`;
      return json({ tokens: [{ recordName: 'x', fieldName: 'file', url: `https://cvws.test/${id}` }] }, 200, headers);
    }
    if (p.endsWith('/private/records/modify')) {
      const body = JSON.parse(init.bodyBuf.toString()) as { operations: { operationType: string; record: { recordName: string; fields?: { file: { value: { receipt: string } }; path: { value: string } } } }[] };
      const op = body.operations[0]!;
      if (op.operationType === 'create') {
        const data = this.pendingAssets.get(op.record.fields!.file.value.receipt) ?? Buffer.alloc(0);
        this.files.set(op.record.recordName, { name: op.record.fields!.path.value, parent: '', data });
        return json({ records: [{ recordName: op.record.recordName }] }, 200, headers);
      }
      if (op.operationType === 'forceDelete') {
        return json({ records: [this.files.delete(op.record.recordName) ? { recordName: op.record.recordName } : { serverErrorCode: 'NOT_FOUND' }] }, 200, headers);
      }
    }
    return json({ serverErrorCode: 'BAD_REQUEST', reason: p }, 400);
  };
}
