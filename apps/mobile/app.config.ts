import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Estende o app.json: o login do Google em app nativo volta por um esquema igual ao
 * ID do cliente invertido (com.googleusercontent.apps.…), que precisa ser registrado.
 */
const reverse = (id?: string) => (id ? id.split('.').reverse().join('.') : null);

export default ({ config }: ConfigContext): ExpoConfig => {
  const schemes = ['nuvigia', reverse(process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS), reverse(process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID)].filter((s): s is string => !!s);
  return { ...config, name: config.name ?? 'Nuvigia', slug: config.slug ?? 'nuvigia', scheme: [...new Set(schemes)] };
};
