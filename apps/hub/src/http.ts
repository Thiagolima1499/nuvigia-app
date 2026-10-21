import { createServer, type Server } from 'node:http';

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

export function startHttp(pairing: Pairing, host: string, port: number): Server {
  const server = createServer((req, res) => {
    const url = req.url ?? '/';
    if (req.method !== 'GET') {
      res.writeHead(405).end();
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
