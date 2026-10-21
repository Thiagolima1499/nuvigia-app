import { describe, expect, it } from 'vitest';

import { buildMessages, deadTokens, isExpoToken } from '../../../../supabase/functions/notify-motion/push';

describe('função notify-motion', () => {
  it('monta a notificação em pt-BR com foto e link para o ao vivo', () => {
    const [m] = buildMessages({ tokens: ['ExponentPushToken[abc]'], cameraId: 'cam-1', cameraName: 'Portão', room: 'Entrada', eventId: 'e1', imageUrl: 'https://x/foto.jpg' });
    expect(m).toMatchObject({
      to: 'ExponentPushToken[abc]',
      title: 'Movimento: Portão',
      body: 'Entrada · Toque para ver ao vivo.',
      channelId: 'movimento',
      data: { cameraId: 'cam-1', eventId: 'e1', url: 'nuvigia://camera/cam-1' },
      richContent: { image: 'https://x/foto.jpg' },
      mutableContent: true,
    });
    const [semFoto] = buildMessages({ tokens: ['t'], cameraId: 'c', cameraName: 'Sala', room: '', eventId: 'e', imageUrl: null });
    expect(semFoto!.body).toBe('Toque para ver ao vivo.');
    expect(semFoto!.richContent).toBeUndefined();
  });

  it('identifica tokens que não existem mais', () => {
    const msgs = buildMessages({ tokens: ['a', 'b', 'c'], cameraId: 'c', cameraName: 'S', room: '', eventId: 'e' });
    expect(deadTokens(msgs, [{ status: 'ok', id: '1' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }, { status: 'error', details: { error: 'MessageRateExceeded' } }])).toEqual(['b']);
  });

  it('aceita só tokens da Expo', () => {
    expect(isExpoToken('ExponentPushToken[xyz]')).toBe(true);
    expect(isExpoToken('ExpoPushToken[xyz]')).toBe(true);
    expect(isExpoToken('qualquer')).toBe(false);
  });
});
