/**
 * Configuração vinda de variáveis EXPO_PUBLIC_* (arquivo apps/mobile/.env).
 * Sem EXPO_PUBLIC_SUPABASE_URL o app roda em modo demonstração, com dados simulados.
 */
export const config = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  /** OAuth do Google Drive (IDs de cliente iOS/Android/Web do Google Cloud). */
  googleClientIdIos: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS ?? '',
  googleClientIdAndroid: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID ?? '',
  googleClientIdWeb: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB ?? '',
  /** OAuth do OneDrive (registro de app no Microsoft Entra, cliente público). */
  microsoftClientId: process.env.EXPO_PUBLIC_MICROSOFT_CLIENT_ID ?? '',
  /** CloudKit Web Services (container iCloud.br.com.nuvigia). */
  cloudKitContainer: process.env.EXPO_PUBLIC_CLOUDKIT_CONTAINER ?? 'iCloud.br.com.nuvigia',
  cloudKitApiToken: process.env.EXPO_PUBLIC_CLOUDKIT_API_TOKEN ?? '',
  cloudKitEnvironment: (process.env.EXPO_PUBLIC_CLOUDKIT_ENV ?? 'development') as 'development' | 'production',
};

export const isDemo = !config.supabaseUrl || !config.supabaseAnonKey;
