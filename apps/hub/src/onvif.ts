import { EventEmitter } from 'node:events';

import onvif, { type Cam } from 'onvif';

export type DiscoveredCamera = { ip: string; model: string; port: number };
export type OnvifProfile = { token: string; width: number; height: number };
export type OnvifCameraInfo = {
  model: string;
  rtspUrl: string;
  profileToken?: string;
  supportsTalk: boolean;
  port: number;
};

export class CameraAuthError extends Error {
  constructor() {
    super('auth_failed');
  }
}

/** Alturas desejadas para cada qualidade do app. */
export const QUALITY_HEIGHT = { '720p': 720, '1080p': 1080, '2K': 1440 } as const;

/** Escolhe o perfil mais próximo da qualidade pedida (sem passar dela, quando possível). */
export function pickProfile(profiles: OnvifProfile[], targetHeight: number): OnvifProfile | undefined {
  if (profiles.length === 0) return undefined;
  const sorted = [...profiles].sort((a, b) => a.height - b.height);
  const fitting = sorted.filter((p) => p.height <= targetHeight);
  return fitting.at(-1) ?? sorted[0];
}

/** Coloca usuário e senha na URL RTSP (só dentro do hub; nunca sai daqui). */
export function withCredentials(rtspUrl: string, username?: string, password?: string): string {
  if (!username) return rtspUrl;
  const u = new URL(rtspUrl);
  u.username = encodeURIComponent(username);
  u.password = encodeURIComponent(password ?? '');
  return u.toString();
}

/** Tira credenciais de uma URL para logs e para o banco. */
export function redact(rtspUrl: string): string {
  try {
    const u = new URL(rtspUrl);
    if (u.username || u.password) {
      u.username = '***';
      u.password = '';
    }
    return u.toString().replace('***:@', '***@');
  } catch {
    return 'rtsp://***';
  }
}

const isAuthError = (e: unknown) => /401|unauthori[sz]ed|NotAuthorized|authority failure|sender not authorized/i.test(String((e as Error)?.message ?? e));

type RawProfile = { $?: { token?: string }; videoEncoderConfiguration?: { resolution?: { width?: number; height?: number } } };

/**
 * ONVIF: descoberta por WS-Discovery, leitura do modelo, do stream RTSP e dos eventos de movimento.
 */
export class OnvifService {
  /** Procura câmeras ONVIF na rede local. Chama `onFound` para cada uma assim que responde. */
  discover(onFound: (c: DiscoveredCamera) => void, timeoutMs = 6000): Promise<number> {
    return new Promise((resolve) => {
      const seen = new Set<string>();
      const handler = (cam: unknown, rinfo: { address: string }) => {
        const c = cam as { hostname?: string; port?: number; xaddrs?: { hostname?: string | null; port?: string | null }[] };
        const ip = c.hostname ?? c.xaddrs?.[0]?.hostname ?? rinfo.address;
        if (!ip || seen.has(ip)) return;
        seen.add(ip);
        onFound({ ip, model: 'Câmera ONVIF', port: Number(c.port ?? c.xaddrs?.[0]?.port ?? 80) || 80 });
      };
      onvif.Discovery.on('device', handler);
      onvif.Discovery.probe({ timeout: timeoutMs, resolve: true }, () => {
        onvif.Discovery.removeListener('device', handler);
        resolve(seen.size);
      });
    });
  }

  private connect(hostname: string, port: number, username?: string, password?: string): Promise<Cam> {
    return new Promise((resolve, reject) => {
      const cam: Cam = new onvif.Cam({ hostname, port, username, password, timeout: 10_000, preserveAddress: true }, (err) => {
        if (err) reject(isAuthError(err) ? new CameraAuthError() : err);
        else resolve(cam);
      });
    });
  }

  /** Conecta na câmera e descobre modelo, perfil e URL RTSP para a qualidade pedida. */
  async probe(opts: { hostname: string; port?: number; username?: string; password?: string; targetHeight: number }): Promise<OnvifCameraInfo> {
    const port = opts.port ?? 80;
    const cam = await this.connect(opts.hostname, port, opts.username, opts.password);
    const info = cam.deviceInformation;
    const model = [info?.manufacturer, info?.model].filter(Boolean).join(' ').trim() || 'Câmera ONVIF';
    const profiles: OnvifProfile[] = ((cam.profiles ?? []) as unknown as RawProfile[])
      .map((p) => ({
        token: p.$?.token ?? '',
        width: Number(p.videoEncoderConfiguration?.resolution?.width ?? 0),
        height: Number(p.videoEncoderConfiguration?.resolution?.height ?? 0),
      }))
      .filter((p) => p.token);
    const profile = pickProfile(profiles, opts.targetHeight);
    const uri = await new Promise<string>((resolve, reject) =>
      cam.getStreamUri({ protocol: 'RTSP', profileToken: profile?.token }, (err: Error | null, data?: { uri: string }) => (err ? reject(isAuthError(err) ? new CameraAuthError() : err) : resolve(data?.uri ?? ''))),
    );
    if (!uri) throw new Error('a câmera não informou o endereço RTSP');
    // Câmeras com saída de áudio anunciam AudioOutput nas capacidades.
    const caps = cam.capabilities as { media?: { streamingCapabilities?: unknown } } | undefined;
    const supportsTalk = JSON.stringify(caps ?? {}).includes('AudioOutput') || Boolean((cam as unknown as { uri?: { media2?: unknown } }).uri?.media2);
    return { model, rtspUrl: withCredentials(uri, opts.username, opts.password), profileToken: profile?.token, supportsTalk, port };
  }

  /**
   * Assina os eventos ONVIF de movimento (pull point). Emite 'motion' quando a câmera avisa.
   * Câmeras sem suporte simplesmente não emitem nada (o detector por imagem continua valendo).
   */
  async watchMotion(opts: { hostname: string; port: number; username?: string; password?: string }): Promise<{ events: EventEmitter; close: () => void }> {
    const cam = await this.connect(opts.hostname, opts.port, opts.username, opts.password);
    const events = new EventEmitter();
    const listener = (msg: unknown) => {
      const m = msg as { topic?: { _?: string }; message?: { message?: { data?: { simpleItem?: unknown } } } };
      const topic = m.topic?._ ?? '';
      if (!/motion|MotionAlarm|CellMotionDetector/i.test(topic)) return;
      const items = m.message?.message?.data?.simpleItem;
      const list = (Array.isArray(items) ? items : [items]) as { $?: { Value?: unknown } }[];
      if (list.some((i) => i?.$?.Value === true || i?.$?.Value === 'true')) events.emit('motion');
    };
    cam.on('event', listener);
    cam.on('eventsError', () => events.emit('unsupported'));
    return { events, close: () => cam.removeListener('event', listener) };
  }
}
