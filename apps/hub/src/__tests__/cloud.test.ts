import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { ConnectCloud } from '../cloud';
import { GoogleDrive } from '../cloud/google';
import { ICloud, type CloudKitToken } from '../cloud/icloud';
import type { OAuthToken, TokenStore } from '../cloud/oauth';
import { OneDrive } from '../cloud/onedrive';
import { AuthExpiredError, type CloudProvider } from '../cloud/provider';
import { FakeCloudKit, FakeGoogle, FakeGraph, type FakeServer } from './cloudFakes';

const memTokens = <T,>(): TokenStore<T> & { value: T | null } => {
  const s = { value: null as T | null, get: () => s.value, set: (t: T) => void (s.value = t) };
  return s;
};

const sample = (bytes: number) => {
  const dir = mkdtempSync(join(tmpdir(), 'nuvigia-cloud-'));
  const path = join(dir, 'clip.mp4');
  const data = Buffer.alloc(bytes);
  for (let i = 0; i < bytes; i++) data[i] = (i * 31) % 251;
  writeFileSync(path, data);
  return { path, data };
};

const CHUNK = 256 * 1024;

type Case = {
  name: string;
  make: () => { server: FakeServer; provider: CloudProvider; tokens: TokenStore<unknown> & { value: unknown } };
  login: ConnectCloud;
  account: string;
  resumable: boolean;
  hasQuota: boolean;
};

const oauthLogin = (provider: 'google' | 'onedrive'): ConnectCloud => ({ type: 'connectCloud', provider, code: 'codigo-ok', codeVerifier: 'verificador', redirectUri: 'nuvigia://oauth', clientId: 'cliente-123' });

const cases: Case[] = [
  {
    name: 'Google Drive',
    make: () => {
      const server = new FakeGoogle();
      const tokens = memTokens<OAuthToken>();
      return { server, tokens: tokens as never, provider: new GoogleDrive(tokens, server.fetch, CHUNK) };
    },
    login: oauthLogin('google'),
    account: 'ana@gmail.com',
    resumable: true,
    hasQuota: true,
  },
  {
    name: 'OneDrive',
    make: () => {
      const server = new FakeGraph();
      const tokens = memTokens<OAuthToken>();
      return { server, tokens: tokens as never, provider: new OneDrive(tokens, server.fetch, 320 * 1024) };
    },
    login: oauthLogin('onedrive'),
    account: 'Ana Souza',
    resumable: true,
    hasQuota: true,
  },
  {
    name: 'iCloud (CloudKit)',
    make: () => {
      const server = new FakeCloudKit();
      const tokens = memTokens<CloudKitToken>();
      return { server, tokens: tokens as never, provider: new ICloud({ container: 'iCloud.br.com.nuvigia', apiToken: 'api-token', environment: 'development' }, tokens, server.fetch) };
    },
    login: { type: 'connectCloud', provider: 'icloud', ckWebAuthToken: 'web+auth/token' },
    account: 'Ana Souza',
    resumable: false,
    hasQuota: false,
  },
];

// Mesmo roteiro para os três provedores.
describe.each(cases)('contrato CloudProvider: $name', (c) => {
  it('conecta, cria a pasta, envia, mede a cota e aplica a retenção', async () => {
    const { server, provider, tokens } = c.make();
    expect(await provider.connect(c.login)).toEqual({ account: c.account });
    expect(tokens.value).not.toBeNull();

    const path = ['Nuvigia', 'Portão', '2026-10-21'];
    const folder = await provider.ensureFolder(path);
    expect(await provider.ensureFolder(path)).toBe(folder); // idempotente

    const { path: file, data } = sample(CHUNK * 2 + 1234);
    const progress: number[] = [];
    const ref = await provider.uploadResumable({ filePath: file, size: data.length, folderRef: folder, name: '10-15-00.mp4', mimeType: 'video/mp4', onProgress: (s) => progress.push(s) });
    const stored = server.files.get(ref);
    expect(stored?.data.equals(data)).toBe(true);
    expect(progress.at(-1)).toBe(data.length);
    expect([...progress].sort((a, b) => a - b)).toEqual(progress);

    const quota = await provider.getQuota();
    if (c.hasQuota) {
      expect(quota.usedBytes).toBeGreaterThanOrEqual(data.length);
      expect(quota.totalBytes).toBeGreaterThan(0);
    } else {
      expect(quota).toEqual({ usedBytes: null, totalBytes: null });
    }

    const removed = await provider.deleteOlderThan(new Date('2026-10-01T00:00:00Z'), [
      { ref, startedAt: '2026-09-01T10:00:00Z' },
      { ref: 'mais-novo', startedAt: '2026-10-20T10:00:00Z' },
    ]);
    expect(removed).toEqual([ref]);
    expect(server.files.has(ref)).toBe(false);
    await provider.deleteFile('nao-existe'); // não é erro
  });

  it('recusa login inválido', async () => {
    const { provider } = c.make();
    const bad = c.login.provider === 'icloud' ? { ...c.login, ckWebAuthToken: 'outro' } : { ...c.login, code: 'errado' };
    await expect(provider.connect(bad)).rejects.toBeInstanceOf(AuthExpiredError);
  });

  it.runIf(c.resumable)('retoma o envio quando um bloco falha', async () => {
    const { server, provider } = c.make();
    await provider.connect(c.login);
    const folder = await provider.ensureFolder(['Nuvigia', 'Sala', '2026-10-21']);
    const { path: file, data } = sample(CHUNK * 3);
    server.failNextChunks = 1;
    const ref = await provider.uploadResumable({ filePath: file, size: data.length, folderRef: folder, name: 'x.mp4', mimeType: 'video/mp4' });
    expect(server.files.get(ref)?.data.equals(data)).toBe(true);
  });

  it.runIf(c.resumable)('renova o token quando a API responde 401', async () => {
    const { server, provider, tokens } = c.make();
    await provider.connect(c.login);
    server.expireNext = true;
    await provider.getQuota();
    expect(server.refreshes).toBe(1);
    expect((tokens.value as OAuthToken).accessToken).toBe('access-1');
    expect((tokens.value as OAuthToken).clientId).toBe('cliente-123');
  });
});

describe('provedores: detalhes', () => {
  it('Google: pastas dentro de Meu Drive/Nuvigia', async () => {
    const server = new FakeGoogle();
    const p = new GoogleDrive(memTokens<OAuthToken>(), server.fetch, CHUNK);
    await p.connect(oauthLogin('google'));
    await p.ensureFolder(['Nuvigia', "Câmera d'Ana", '2026-10-21']);
    const names = [...server.files.values()].map((f) => `${f.parent}>${f.name}`);
    expect(names[0]).toBe('root>Nuvigia');
    expect(names[1]).toMatch(/^folder-\d+>Câmera d'Ana$/);
  });

  it('OneDrive: usa a pasta do app e não manda o token para a URL de envio', async () => {
    const server = new FakeGraph();
    const p = new OneDrive(memTokens<OAuthToken>(), server.fetch, 320 * 1024);
    await p.connect(oauthLogin('onedrive'));
    const folder = await p.ensureFolder(['Nuvigia', 'Portão', '2026-10-21']);
    expect(folder).toBe('Portão/2026-10-21');
    const { path, data } = sample(1000);
    const ref = await p.uploadResumable({ filePath: path, size: data.length, folderRef: folder, name: 'a.mp4', mimeType: 'video/mp4' });
    expect(server.files.get(ref)?.name).toBe('Portão/2026-10-21/a.mp4');
  });

  it('iCloud: guarda o token renovado pelo CloudKit', async () => {
    const server = new FakeCloudKit();
    const tokens = memTokens<CloudKitToken>();
    const p = new ICloud({ container: 'iCloud.br.com.nuvigia', apiToken: 'api-token', environment: 'development' }, tokens, server.fetch);
    server.rotateTo = 'girado';
    await p.connect({ type: 'connectCloud', provider: 'icloud', ckWebAuthToken: 'web+auth/token' });
    expect(tokens.value).toEqual({ webAuthToken: 'girado' });
  });

  it('iCloud: sem token de API configurado explica o problema', async () => {
    const p = new ICloud({ container: 'c', apiToken: '', environment: 'development' }, memTokens<CloudKitToken>(), new FakeCloudKit().fetch);
    await expect(p.connect({ type: 'connectCloud', provider: 'icloud', ckWebAuthToken: 't' })).rejects.toThrow(/CLOUDKIT_API_TOKEN/);
  });
});
