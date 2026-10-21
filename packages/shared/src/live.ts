import { z } from 'zod';

/**
 * Sinalização WebRTC no canal `hub:<id>` (evento `signal`). Sem trickle: o app
 * junta os candidatos ICE antes de mandar a oferta e o go2rtc responde com os dele.
 */
export const SignalMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('offer'), sessionId: z.string().min(1), cameraId: z.string().min(1), sdp: z.string().min(1).max(20_000) }),
  z.object({ type: z.literal('answer'), sessionId: z.string().min(1), sdp: z.string().min(1) }),
  z.object({ type: z.literal('error'), sessionId: z.string().min(1), error: z.string() }),
  z.object({ type: z.literal('bye'), sessionId: z.string().min(1) }),
]);
export type SignalMessage = z.infer<typeof SignalMessage>;

/** Servidores ICE devolvidos pela função `turn-credentials`. */
export const IceServers = z.object({
  iceServers: z.array(z.object({ urls: z.union([z.string(), z.array(z.string())]), username: z.string().optional(), credential: z.string().optional() })),
  ttl: z.number().int().positive(),
});
export type IceServers = z.infer<typeof IceServers>;

/** Endereço temporário (HLS ou arquivo) servido pelo hub através do túnel, quando houver. */
export type TempLink = { url: string; expiresAt: string };
