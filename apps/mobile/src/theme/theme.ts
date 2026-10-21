/**
 * Tokens do design system Organic (fonte: design_handoff_nuvigia/tokens.css e README).
 * Nenhuma cor, fonte, raio ou sombra deve ser usada fora deste arquivo.
 */

export const neutral = {
  100: '#f9f4ed',
  200: '#eee7db',
  300: '#dcd3c4',
  400: '#c0b6a5',
  500: '#a19786',
  600: '#82796a',
  700: '#645c50',
  800: '#474238',
  900: '#2e2b25',
} as const;

export const accent = {
  100: '#fff2eb',
  200: '#ffe1d0',
  300: '#ffc6a5',
  400: '#f6a06b',
  500: '#d67f48',
  600: '#b2622d',
  700: '#8c491a',
  800: '#643312',
  900: '#402310',
} as const;

export const sage = {
  100: '#f0fae1',
  200: '#e1eecc',
  300: '#ccdbb2',
  400: '#aebf92',
  500: '#8fa073',
  600: '#728157',
  700: '#56633f',
  800: '#3d472b',
  900: '#272e1b',
} as const;

export const colors = {
  bg: '#f5ead8',
  surface: '#ebddc5',
  text: '#201e1d',
  accent: '#c67139',
  accent2: '#7a8a5e',
  /** #201e1d a 16% (color-mix do tokens.css). */
  divider: 'rgba(32, 30, 29, 0.16)',
  /** Estados de botão secundário: texto a 7% (hover) e 14% (pressionado). */
  textWash7: 'rgba(32, 30, 29, 0.07)',
  textWash14: 'rgba(32, 30, 29, 0.14)',
  /** Borda de campo em hover (texto a 45%) e rótulo de campo (texto a 70%). */
  textWash45: 'rgba(32, 30, 29, 0.45)',
  textMuted70: 'rgba(32, 30, 29, 0.7)',
  /** Estados de botão fantasma: destaque a 10% e 18%. */
  accentWash10: 'rgba(198, 113, 57, 0.10)',
  accentWash18: 'rgba(198, 113, 57, 0.18)',
  /** Fundo do diálogo: neutral-900 a 50%. */
  backdrop: 'rgba(46, 43, 37, 0.5)',
  /** Selo "AO VIVO": neutral-900 a 70%. */
  liveBadge: 'rgba(46, 43, 37, 0.7)',
  /** Texto em laranja no tamanho de parágrafo (contraste). */
  accentText: accent[700],
  neutral,
  accentRamp: accent,
  sage,
} as const;

export const space = {
  1: 4.4,
  2: 8.8,
  3: 13.2,
  4: 17.6,
  6: 26.4,
  8: 35.2,
} as const;

export const radius = {
  sm: 8,
  md: 16,
  lg: 28,
  /** Diálogo/folha inferior. */
  dialog: 36,
  pill: 999,
} as const;

/** Sombras como `boxShadow` (suportado no React Native New Architecture e na web). */
export const shadow = {
  sm: '0px 1px 2px rgba(46, 43, 37, 0.14)',
  md: '0px 3px 10px rgba(46, 43, 37, 0.16)',
  lg: '0px 12px 32px rgba(46, 43, 37, 0.22)',
} as const;

export const fonts = {
  heading: 'Caprasimo_400Regular',
  body: 'Figtree_400Regular',
  bodySemiBold: 'Figtree_600SemiBold',
  bodyBold: 'Figtree_700Bold',
} as const;

/** Escala de tipo usada: Caprasimo 32/30/22/19/17 e Figtree 16/15/14/13/12/11. */
export const type = {
  heading: { 32: 32, 30: 30, 22: 22, 19: 19, 17: 17 },
  body: { 16: 16, 15: 15, 14: 14, 13: 13, 12: 12, 11: 11 },
} as const;

/** Larguras máximas de conteúdo por tela (tablet). */
export const maxWidth = {
  cameras: 1080,
  live: 880,
  settings: 640,
  addCamera: 560,
  dialog: 460,
  toast: 420,
  tabBar: 480,
} as const;

export const icon = {
  strokeWidth: 2.75,
} as const;

/** Alvo de toque mínimo (acessibilidade). */
export const minTouch = 44;

export const focusRing = {
  outlineColor: colors.accent,
  outlineWidth: 2,
  outlineOffset: 2,
  outlineStyle: 'solid',
} as const;

export const theme = { colors, space, radius, shadow, fonts, type, maxWidth, icon, minTouch, focusRing };
export type Theme = typeof theme;
export default theme;
