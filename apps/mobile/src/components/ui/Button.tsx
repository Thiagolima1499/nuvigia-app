import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text as RNText, View, type StyleProp, type ViewStyle } from 'react-native';

import { useInteraction } from '@/hooks/useInteraction';
import { accent, colors, fonts, focusRing, minTouch, radius, space } from '@/theme/theme';

import { Icon } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
/** md: padrão do Organic (14px); lg: "Conectar câmera" (54px, 16px); xl: botão de gravar (58px, 17px). */
export type ButtonSize = 'md' | 'lg' | 'xl';

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  /** Elemento livre à esquerda do rótulo (ex.: ponto/quadrado de gravação). */
  leading?: React.ReactNode;
  block?: boolean;
  disabled?: boolean;
  /** Sobrescreve as cores (ex.: estado "gravando" do botão principal). */
  colorsOverride?: { bg: string; fg: string; bgHover?: string; bgPressed?: string };
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const palette = {
  primary: { bg: colors.accent, hover: accent[600], pressed: accent[700], fg: colors.bg, border: 'transparent' },
  secondary: { bg: 'transparent', hover: colors.textWash7, pressed: colors.textWash14, fg: colors.text, border: colors.divider },
  ghost: { bg: 'transparent', hover: colors.accentWash10, pressed: colors.accentWash18, fg: colors.accent, border: 'transparent' },
} as const;

const sizes = {
  md: { minHeight: minTouch, fontSize: 14, paddingH: space[3] * 1.2, iconSize: 18 },
  lg: { minHeight: 54, fontSize: 16, paddingH: space[6], iconSize: 18 },
  xl: { minHeight: 58, fontSize: 17, paddingH: space[6], iconSize: 18 },
} as const;

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  leading,
  block,
  disabled,
  colorsOverride,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: ButtonProps) {
  const { hovered, focused, handlers } = useInteraction();
  const p = palette[variant];
  const s = sizes[size];
  const fg = colorsOverride?.fg ?? p.fg;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      {...handlers}
      style={({ pressed }) => {
        const bg = colorsOverride
          ? pressed
            ? (colorsOverride.bgPressed ?? colorsOverride.bg)
            : hovered
              ? (colorsOverride.bgHover ?? colorsOverride.bg)
              : colorsOverride.bg
          : pressed
            ? p.pressed
            : hovered
              ? p.hover
              : p.bg;
        return [
          styles.base,
          {
            minHeight: s.minHeight,
            paddingHorizontal: variant === 'ghost' ? space[1] * 2 : s.paddingH,
            backgroundColor: bg,
            borderColor: p.border,
            opacity: disabled ? 0.45 : 1,
          },
          block && styles.block,
          focused && styles.focus,
          style,
        ];
      }}
    >
      <View style={styles.row}>
        {leading}
        {icon ? <Icon icon={icon} size={s.iconSize} color={fg} /> : null}
        <RNText style={[styles.label, { fontSize: s.fontSize, color: fg }]}>{label}</RNText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  block: { alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  label: { fontFamily: fonts.heading, lineHeight: undefined, textAlign: 'center' },
  focus: focusRing,
});
