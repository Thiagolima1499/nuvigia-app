import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { useInteraction } from '@/hooks/useInteraction';
import { accent, colors, focusRing, neutral } from '@/theme/theme';

import { Icon } from './Icon';

/** primary: "+" laranja 48px; surface: voltar/fechar 44px em `surface`. */
export type IconButtonVariant = 'primary' | 'surface';

export type IconButtonProps = {
  icon: LucideIcon;
  /** Obrigatório: botões só com ícone precisam de rótulo de acessibilidade. */
  accessibilityLabel: string;
  onPress?: () => void;
  variant?: IconButtonVariant;
  size?: number;
  iconSize?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const palette = {
  primary: { bg: colors.accent, hover: accent[600], pressed: accent[700], fg: colors.bg },
  surface: { bg: colors.surface, hover: neutral[300], pressed: neutral[400], fg: colors.text },
} as const;

export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  variant = 'surface',
  size,
  iconSize,
  disabled,
  style,
  testID,
}: IconButtonProps) {
  const { hovered, focused, handlers } = useInteraction();
  const p = palette[variant];
  const dim = size ?? (variant === 'primary' ? 48 : 44);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={dim < 44 ? (44 - dim) / 2 : undefined}
      {...handlers}
      style={({ pressed }) => [
        styles.base,
        { width: dim, height: dim, backgroundColor: pressed ? p.pressed : hovered ? p.hover : p.bg, opacity: disabled ? 0.45 : 1 },
        focused && focusRing,
        style,
      ]}
    >
      <Icon icon={icon} size={iconSize ?? (variant === 'primary' ? 22 : 20)} color={p.fg} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
