// Montagem das mensagens para o serviço de push da Expo (FCM/APNs) e leitura das respostas.
// Sem dependências do Deno, para poder testar no Node.

export type PushMessage = {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  priority: 'high';
  channelId: string;
  data: { cameraId: string; eventId: string; url: string };
  richContent?: { image: string };
  mutableContent?: boolean;
};

export type PushTicket = { status: 'ok'; id: string } | { status: 'error'; message?: string; details?: { error?: string } };

/** Intervalo mínimo entre notificações da mesma câmera. */
export const COOLDOWN_SECONDS = 60;
export const ANDROID_CHANNEL = 'movimento';

export function buildMessages(input: { tokens: string[]; cameraId: string; cameraName: string; room: string; eventId: string; imageUrl?: string | null }): PushMessage[] {
  const body = input.room ? `${input.room} · Toque para ver ao vivo.` : 'Toque para ver ao vivo.';
  return input.tokens.map((to) => ({
    to,
    title: `Movimento: ${input.cameraName}`,
    body,
    sound: 'default',
    priority: 'high',
    channelId: ANDROID_CHANNEL,
    data: { cameraId: input.cameraId, eventId: input.eventId, url: `nuvigia://camera/${input.cameraId}` },
    ...(input.imageUrl ? { richContent: { image: input.imageUrl }, mutableContent: true } : {}),
  }));
}

/** Tokens que o serviço disse que não existem mais (app desinstalado etc.). */
export function deadTokens(messages: PushMessage[], tickets: PushTicket[]): string[] {
  return tickets.flatMap((t, i) => (t.status === 'error' && t.details?.error === 'DeviceNotRegistered' && messages[i] ? [messages[i]!.to] : []));
}

export function isExpoToken(t: string) {
  return /^Expo(nent)?PushToken\[[^\]]+\]$/.test(t);
}
