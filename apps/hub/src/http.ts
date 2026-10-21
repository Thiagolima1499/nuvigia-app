import { createReadStream, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { Readable } from 'node:stream';

import type { LinkSigner } from './links';

import type { Pairing } from './pairing';
import { pairingQrSvg } from './pairing';

// Cores dos tokens do app (theme.ts) para a página local ficar com a mesma cara.
const C = { bg: '#f5ead8', surface: '#ebddc5', text: '#201e1d', muted: '#645c50', accent: '#8c491a' };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

function page(body: string, refresh: boolean) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${refresh ? '<meta http-equiv="refresh" content="10">' : ''}<title>Hub Nuvigia</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:${C.bg};color:${C.text};display:grid;place-items:center;min-height:100vh;padding:16px;box-sizing:border-box}
main{background:${C.surface};border-radius:28px;padding:32px;max-width:460px;width:100%;text-align:center;box-shadow:0px 12px 32px rgba(46,43,37,.22)}
h1{font-size:28px;margin:0 0 8px}p{color:${C.muted};line-height:1.5;margin:8px 0}.code{font-size:40px;font-weight:700;letter-spacing:6px;color:${C.accent};margin:16px 0}svg{max-width:240px;height:auto}</style>
</head><body><main>${body}</main></body></html>`;
}

/**
 * Página na rede de casa (http://<ip-do-hub>:8787) com o QR e o código de pareamento.
 * Não expõe nada além do código de uso único e do status; nenhuma porta é aberta no roteador.
 */
export async function renderStatus(pairing: Pairing): Promise<string> {
  const s = pairing.state;
  switch (s.status) {
    case 'waiting': {
      const svg = await pairingQrSvg(s.code);
      const until = new Date(s.expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      return page(
        `<h1>Parear este hub</h1><p>No app Nuvigia, toque em <b>Parear hub</b> e leia o QR, ou digite o código.</p>${svg}<div class="code">${esc(s.code.slice(0, 3))} ${esc(s.code.slice(3))}</div><p>Vale até ${esc(until)} e só pode ser usado uma vez.</p>`,
        true,
      );
    }
    case 'paired':
      return page('<h1>Hub pareado</h1><p>Tudo pronto. Use o app Nuvigia para ver e gravar suas câmeras.</p>', false);
    case 'error':
      return page(`<h1>Sem conexão</h1><p>Não foi possível falar com o servidor. Tentando de novo…</p><p><small>${esc(s.message)}</small></p>`, true);
    default:
      return page('<h1>Iniciando…</h1><p>Verificando o hub.</p>', true);
  }
}

/** Rotas do túnel (Cloudflare Tunnel etc.): só com token assinado e de curta duração. */
export type TunnelDeps = {
  signer: LinkSigner;
  go2rtcUrl: string;
  streamName: (cameraId: string) => string;
  filePath: (recordingId: string) => string | null;
  fetchImpl?: typeof fetch;
};

const CORS = { 'access-control-allow-origin': '*', 'cache-control': 'no-store' };

/** /hls/<token>/api/stream.m3u8 e /hls/<token>/api/hls/... → go2rtc (só a câmera do token). */
async function proxyHls(t: TunnelDeps, token: string, rest: string, res: ServerResponse) {
  const claims = t.signer.verify(token, 'hls');
  if (!claims) return void res.writeHead(403, CORS).end();
  const u = new URL(rest, 'http://x/');
  let target: URL;
  if (u.pathname === '/api/stream.m3u8') {
    target = new URL('api/stream.m3u8', t.go2rtcUrl.endsWith('/') ? t.go2rtcUrl : `${t.go2rtcUrl}/`);
    target.searchParams.set('src', t.streamName(claims.id));
  } else if (/^\/api\/hls\/[a-z0-9_.-]+$/i.test(u.pathname)) {
    target = new URL(u.pathname.slice(1) + u.search, t.go2rtcUrl.endsWith('/') ? t.go2rtcUrl : `${t.go2rtcUrl}/`);
  } else {
    return void res.writeHead(404, CORS).end();
  }
  const up = await (t.fetchImpl ?? fetch)(target).catch(() => null);
  if (!up || !up.ok || !up.body) return void res.writeHead(up?.status ?? 502, CORS).end();
  res.writeHead(200, { ...CORS, 'content-type': up.headers.get('content-type') ?? 'application/octet-stream' });
  Readable.fromWeb(up.body as never).pipe(res);
}

/** /files/<token>: arquivo de uma gravação que ainda está no hub, com suporte a Range. */
function serveFile(t: TunnelDeps, token: string, req: IncomingMessage, res: ServerResponse) {
  const claims = t.signer.verify(token, 'file');
  const path = claims ? t.filePath(claims.id) : null;
  if (!path) return void res.writeHead(claims ? 404 : 403, CORS).end();
  let size: number;
  try {
    size = statSync(path).size;
  } catch {
    return void res.writeHead(404, CORS).end();
  }
  const type = path.endsWith('.jpg') ? 'image/jpeg' : 'video/mp4';
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
  if (m && (m[1] || m[2])) {
    const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start > end || start >= size) return void res.writeHead(416, { ...CORS, 'content-range': `bytes */${size}` }).end();
    res.writeHead(206, { ...CORS, 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': String(end - start + 1) });
    createReadStream(path, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { ...CORS, 'content-type': type, 'accept-ranges': 'bytes', 'content-length': String(size) });
  createReadStream(path).pipe(res);
}

export function startHttp(pairing: Pairing, host: string, port: number, tunnel?: TunnelDeps): Server {
  const server = createServer((req, res) => {
    const url = req.url ?? '/';
    if (req.method !== 'GET') {
      res.writeHead(405).end();
      return;
    }
    const hls = /^\/hls\/([^/]+)(\/.*)$/.exec(url);
    if (hls && tunnel) {
      void proxyHls(tunnel, hls[1]!, hls[2]!, res).catch(() => res.writeHead(502).end());
      return;
    }
    const file = /^\/files\/([^/?]+)/.exec(url);
    if (file && tunnel) {
      serveFile(tunnel, file[1]!, req, res);
      return;
    }
    // Pelo túnel (pedido repassado) só valem as rotas com token: a página de pareamento é só da rede de casa.
    if (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']) {
      res.writeHead(404).end();
      return;
    }
    if (url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, pairing: pairing.state.status }));
      return;
    }
    if (url !== '/' && !url.startsWith('/?')) {
      res.writeHead(404).end();
      return;
    }
    renderStatus(pairing)
      .then((html) =>
        res
          .writeHead(200, {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store',
            'x-frame-options': 'DENY',
            'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
          })
          .end(html),
      )
      .catch(() => res.writeHead(500).end());
  });
  server.listen(port, host);
  return server;
}
