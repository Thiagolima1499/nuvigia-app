import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { iceServers, turnCredentials } from '../../../../supabase/functions/turn-credentials/turn';

describe('função turn-credentials', () => {
  it('gera usuário e senha no formato do coturn', async () => {
    const now = Date.parse('2026-10-21T12:00:00Z');
    const c = await turnCredentials('segredo', 'user-1', 3600, now);
    expect(c.username).toBe(`${now / 1000 + 3600}:user-1`);
    expect(c.credential).toBe(createHmac('sha1', 'segredo').update(c.username).digest('base64'));
  });

  it('sem TURN configurado devolve só STUN', async () => {
    expect(await iceServers({}, 'u', 60)).toEqual([{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }]);
    const withTurn = await iceServers({ TURN_SECRET: 's', TURN_URLS: 'turn:turn.exemplo.com:3478?transport=udp, turns:turn.exemplo.com:5349?transport=tcp', STUN_URLS: '' }, 'u', 60);
    expect(withTurn).toHaveLength(1);
    expect(withTurn[0]!.urls).toEqual(['turn:turn.exemplo.com:3478?transport=udp', 'turns:turn.exemplo.com:5349?transport=tcp']);
    expect(withTurn[0]!.username).toMatch(/^\d+:u$/);
  });
});
