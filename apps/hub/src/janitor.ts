import { rmSync } from 'node:fs';

import type { Logger } from 'pino';

import type { Backend } from './backend';
import type { LocalStore } from './store';

const DAY = 86_400_000;

/**
 * Libera o disco do hub: apaga arquivos já enviados depois de `keepDays`
 * e arquivos só locais que passaram da retenção escolhida no app.
 */
export async function cleanLocalFiles(opts: { store: LocalStore; backend: Backend; keepDays: number; retentionDays: number | null; log: Logger; now?: number }) {
  const now = opts.now ?? Date.now();
  const uploadedBefore = new Date(now - opts.keepDays * DAY);
  const localBefore = opts.retentionDays ? new Date(now - opts.retentionDays * DAY) : null;
  const files = opts.store.expiredFiles(uploadedBefore, localBefore);
  for (const f of files) {
    rmSync(f.path, { force: true });
    opts.store.deleteFile(f.recordingId);
    // só local e vencido: a gravação deixa de existir também no app
    if (f.status !== 'done') await opts.backend.deleteRecording(f.recordingId).catch(() => undefined);
  }
  if (files.length) opts.log.info({ count: files.length }, 'arquivos locais antigos removidos');
  return files.length;
}

/** O app apagou uma gravação: some com o arquivo local também. */
export function forgetRecording(store: LocalStore, recordingId: string) {
  const f = store.getFile(recordingId);
  if (!f) return;
  rmSync(f.path, { force: true });
  store.deleteFile(recordingId);
}
