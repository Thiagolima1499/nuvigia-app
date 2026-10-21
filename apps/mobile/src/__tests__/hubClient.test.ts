import type { SupabaseClient } from '@supabase/supabase-js';

import { HubClient } from '@/services/hubClient';

/** Canal falso que imita o hub: responde a cada comando com command_result. */
function fakeSupabase(reply: (cmd: { requestId: string; command: { type: string } }) => unknown) {
  const handlers: Record<string, (m: { payload: unknown }) => void> = {};
  const channel = {
    on: (_t: string, { event }: { event: string }, cb: (m: { payload: unknown }) => void) => {
      handlers[event] = cb;
      return channel;
    },
    subscribe: (cb: (s: string) => void) => {
      cb('SUBSCRIBED');
      return channel;
    },
    send: async ({ event, payload }: { event: string; payload: { requestId: string; command: { type: string } } }) => {
      if (event === 'command') {
        const res = reply(payload);
        if (res !== undefined) setTimeout(() => handlers.command_result?.({ payload: res }), 0);
      }
      return 'ok';
    },
  };
  const supabase = { channel: jest.fn(() => channel), removeChannel: jest.fn() } as unknown as SupabaseClient;
  return { supabase, handlers };
}

describe('HubClient', () => {
  it('usa o canal privado hub:<id> e casa respostas pelo requestId', async () => {
    const { supabase } = fakeSupabase(({ requestId, command }) => ({ requestId, ok: true, data: { echoed: command.type } }));
    const hub = new HubClient(supabase, 'abc');
    await expect(hub.send({ type: 'ping' })).resolves.toEqual({ echoed: 'ping' });
    expect(supabase.channel).toHaveBeenCalledWith('hub:abc', expect.objectContaining({ config: expect.objectContaining({ private: true }) }));
  });

  it('propaga erro do hub', async () => {
    const { supabase } = fakeSupabase(({ requestId }) => ({ requestId, ok: false, error: 'auth_failed' }));
    await expect(new HubClient(supabase, 'abc').send({ type: 'snapshot', cameraId: 'c1' })).rejects.toThrow('auth_failed');
  });

  it('expira quando o hub não responde', async () => {
    const { supabase } = fakeSupabase(() => undefined);
    await expect(new HubClient(supabase, 'abc').send({ type: 'ping' }, 20)).rejects.toThrow('hub_timeout');
  });

  it('entrega só eventos válidos', async () => {
    const { supabase, handlers } = fakeSupabase(() => undefined);
    const hub = new HubClient(supabase, 'abc');
    const got: unknown[] = [];
    hub.onEvent((e) => got.push(e));
    await hub.connect();
    handlers.hub_event?.({ payload: { type: 'cameraDiscovered', model: 'Tapo C200', ip: '192.168.0.41' } });
    handlers.hub_event?.({ payload: { type: 'desconhecido' } });
    expect(got).toEqual([{ type: 'cameraDiscovered', model: 'Tapo C200', ip: '192.168.0.41' }]);
  });
});
