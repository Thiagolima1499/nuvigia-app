import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { colors, fonts } from '@/theme/theme';

type Weight = 'regular' | 'semibold' | 'bold';

export type TextProps = RNTextProps & {
  /** Tamanho em px (Figtree 16/15/14/13/12/11). */
  size?: 16 | 15 | 14 | 13 | 12 | 11;
  weight?: Weight;
  color?: string;
  /** Números tabulares (relógios, cronômetros). */
  tabular?: boolean;
};

const family: Record<Weight, string> = {
  regular: fonts.body,
  semibold: fonts.bodySemiBold,
  bold: fonts.bodyBold,
};

/** Texto do corpo em Figtree. */
export function Text({ size = 15, weight = 'regular', color = colors.text, tabular, style, ...rest }: TextProps) {
  const base: TextStyle = {
    fontFamily: family[weight],
    fontSize: size,
    lineHeight: Math.round(size * 1.4),
    color,
    fontVariant: tabular ? ['tabular-nums'] : undefined,
  };
  return <RNText {...rest} style={[base, style]} />;
}

export type HeadingProps = RNTextProps & {
  /** Tamanho em px (Caprasimo 32/30/22/19/17). */
  size?: 32 | 30 | 22 | 19 | 17;
  color?: string;
  lineHeight?: number;
};

/** Títulos em Caprasimo. */
export function Heading({ size = 22, color = colors.text, lineHeight, style, ...rest }: HeadingProps) {
  return (
    <RNText
      accessibilityRole="header"
      {...rest}
      style={[
        {
          fontFamily: fonts.heading,
          fontSize: size,
          lineHeight: lineHeight ?? Math.round(size * 1.12),
          letterSpacing: -0.015 * size,
          color,
        },
        style,
      ]}
    />
  );
}
