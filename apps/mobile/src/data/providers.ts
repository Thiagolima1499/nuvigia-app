import type { CloudProviderId } from '@nuvigia/shared';

import { accent, neutral, sage } from '@/theme/theme';

export type ProviderInfo = {
  id: CloudProviderId;
  name: string;
  /** Nome curto usado na tag "No {short}". */
  short: string;
  initial: string;
  /** Conta simulada exibida em Ajustes. */
  account: string;
  folder: string;
  /** Nota do diálogo de escolha. */
  note: string;
  cta: string;
  badgeBg: string;
  badgeFg: string;
  /** Cota simulada (bytes). */
  usedBytes: number;
  totalBytes: number;
};

const GB = 1e9;

/** Provedores de nuvem e dados simulados iguais aos do protótipo. */
export const PROVIDERS: Record<CloudProviderId, ProviderInfo> = {
  google: {
    id: 'google',
    name: 'Google Drive',
    short: 'Drive',
    initial: 'G',
    account: 'voce@gmail.com',
    folder: 'Meu Drive › Nuvigia',
    note: '15 GB grátis',
    cta: 'Entrar com Google',
    badgeBg: sage[300],
    badgeFg: sage[900],
    usedBytes: 38.2 * GB,
    totalBytes: 100 * GB,
  },
  onedrive: {
    id: 'onedrive',
    name: 'OneDrive',
    short: 'OneDrive',
    initial: 'O',
    account: 'voce@outlook.com',
    folder: 'OneDrive › Aplicativos › Nuvigia',
    note: '5 GB grátis',
    cta: 'Entrar com Microsoft',
    badgeBg: accent[300],
    badgeFg: accent[900],
    usedBytes: 12.4 * GB,
    totalBytes: 1000 * GB,
  },
  icloud: {
    id: 'icloud',
    name: 'iCloud Drive',
    short: 'iCloud',
    initial: 'A',
    account: 'Conta Apple · voce@icloud.com',
    folder: 'iCloud Drive › Nuvigia',
    note: '5 GB grátis',
    cta: 'Entrar com Apple',
    badgeBg: neutral[300],
    badgeFg: neutral[900],
    usedBytes: 146 * GB,
    totalBytes: 200 * GB,
  },
};

export const PROVIDER_ORDER: CloudProviderId[] = ['google', 'onedrive', 'icloud'];
