/** Canal privado de broadcast de um hub (comandos, eventos e sinalização). */
export const hubTopic = (hubId: string) => `hub:${hubId}`;

/** Nomes dos eventos de broadcast no canal do hub. */
export const BroadcastEvent = {
  /** app → hub: `HubCommand` com `requestId`. */
  command: 'command',
  /** hub → app: resposta a um comando (`CommandResult`). */
  commandResult: 'command_result',
  /** hub → app: `HubEvent` (descoberta, progresso, etc.). */
  event: 'hub_event',
  /** sinalização WebRTC nos dois sentidos (`SignalMessage`). */
  signal: 'signal',
} as const;

export type CommandResult = { requestId: string; ok: true; data?: unknown } | { requestId: string; ok: false; error: string };

/** Formato do código de pareamento (6 dígitos). */
export const PAIRING_CODE_RE = /^[0-9]{6}$/;
export const PAIRING_TTL_MINUTES = 10;

/** Extrai o código de um QR do hub: `nuvigia://parear?codigo=123456` ou só os dígitos. */
export function parsePairingPayload(text: string): string | null {
  const trimmed = text.trim();
  if (PAIRING_CODE_RE.test(trimmed)) return trimmed;
  const m = /[?&]codigo=([0-9]{6})\b/.exec(trimmed);
  return m?.[1] ?? null;
}

export const pairingUrl = (code: string) => `nuvigia://parear?codigo=${code}`;
