import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, HubCommand, HubEvent, Recording, Settings } from './index';

describe('Settings', () => {
  it('padrões do app são válidos', () => {
    expect(Settings.parse(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });
  it('rejeita qualidade desconhecida', () => {
    expect(Settings.safeParse({ ...DEFAULT_SETTINGS, quality: '4K' }).success).toBe(false);
  });
});

describe('Recording', () => {
  it('limita o progresso de envio a 0–100', () => {
    const base = { id: 'r1', cameraId: 'c1', startedAt: '2026-10-21T14:32:00-03:00', durationSec: 72, kind: 'video', uploadProgress: 64, status: 'uploading' };
    expect(Recording.safeParse(base).success).toBe(true);
    expect(Recording.safeParse({ ...base, uploadProgress: 120 }).success).toBe(false);
  });
});

describe('mensagens', () => {
  it('valida comandos pelo tipo', () => {
    expect(HubCommand.safeParse({ type: 'startRecording', cameraId: 'c1' }).success).toBe(true);
    expect(HubCommand.safeParse({ type: 'startRecording' }).success).toBe(false);
    expect(HubCommand.safeParse({ type: 'formatDisk' }).success).toBe(false);
  });
  it('valida eventos de progresso', () => {
    expect(HubEvent.parse({ type: 'uploadProgress', recordingId: 'r1', progress: 64 })).toMatchObject({ progress: 64 });
  });
});
