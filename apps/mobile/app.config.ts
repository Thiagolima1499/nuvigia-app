import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Estende o app.json: o login do Google em app nativo volta por um esquema igual ao
 * ID do cliente invertido (com.googleusercontent.apps.…), que precisa ser registrado.
 */
const reverse = (id?: string) => (id ? id.split('.').reverse().join('.') : null);

export default ({ config }: ConfigContext): ExpoConfig => {
  const schemes = ['nuvigia', reverse(process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS), reverse(process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID)].filter((s): s is string => !!s);
  // ID do projeto no EAS: necessário para o token de push (notificações de movimento)
  const projectId = process.env.EAS_PROJECT_ID;
  const extra = projectId ? { ...config.extra, eas: { ...config.extra?.eas, projectId } } : config.extra;
  return { ...config, name: config.name ?? 'Nuvigia', slug: config.slug ?? 'nuvigia', scheme: [...new Set(schemes)], extra };
};
