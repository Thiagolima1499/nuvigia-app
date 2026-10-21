import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

/** Variáveis de ambiente do hub (ver .env.example). */
const Env = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_ANON_KEY: z.string().min(20),
  /** Segredo opcional exigido pela função hub-register (HUB_REGISTRATION_SECRET no Supabase). */
  HUB_REGISTRATION_SECRET: z.string().optional(),
  /** Chave AES-256 (32 bytes em base64 ou hex) que cifra credenciais e tokens no disco. */
  HUB_SECRET_KEY: z.string().min(32),
  HUB_NAME: z.string().max(60).default('Hub Nuvigia'),
  DATA_DIR: z.string().default('./data'),
  GO2RTC_URL: z.url().default('http://127.0.0.1:1984'),
  /** RTSP de saída do go2rtc (o gravador lê daqui, a câmera recebe uma conexão só). */
  GO2RTC_RTSP: z.string().default('rtsp://127.0.0.1:8554'),
  FFMPEG_PATH: z.string().default('ffmpeg'),
  /** Página local com o QR de pareamento (só na rede de casa). */
  HTTP_HOST: z.string().default('0.0.0.0'),
  HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  MDNS: bool.default(true),
  /** Duração de cada arquivo na gravação contínua. */
  SEGMENT_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
  /** Duração do clipe gravado após detectar movimento. */
  MOTION_CLIP_SECONDS: z.coerce.number().int().min(5).max(600).default(30),
  /** Fração de pixels que precisam mudar para contar como movimento (0–1). */
  MOTION_SENSITIVITY: z.coerce.number().min(0.001).max(1).default(0.02),
  /** Gravação manual para sozinha depois deste tempo. */
  MAX_MANUAL_SECONDS: z.coerce.number().int().min(60).default(3600),
  /** Arquivos locais já enviados são apagados depois destes dias. */
  LOCAL_KEEP_DAYS: z.coerce.number().int().min(0).default(3),
  /** iCloud (CloudKit Web Services). O token de API é o mesmo usado no app. */
  CLOUDKIT_CONTAINER: z.string().default('iCloud.br.com.nuvigia'),
  CLOUDKIT_API_TOKEN: z.string().default(''),
  CLOUDKIT_ENV: z.enum(['development', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Config = z.infer<typeof Env> & { version: string };

export const HUB_VERSION = '0.1.0';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Configuração inválida do hub:\n${lines.join('\n')}`);
  }
  return { ...parsed.data, version: HUB_VERSION };
}
