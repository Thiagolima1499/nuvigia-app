import { useState, type ComponentRef, type Ref } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { accent, colors, fonts, neutral } from '@/theme/theme';

import { Text } from './Text';

export type InputProps = TextInputProps & {
  label: string;
  ref?: Ref<ComponentRef<typeof TextInput>>;
  /** Mensagem de erro abaixo do campo (12px, accent-700). */
  error?: string;
};

/** Campo em pílula (altura 48, padding 0 18px) com rótulo de 12px. */
export function Input({ label, error, style, onFocus, onBlur, ref, ...rest }: InputProps) {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const border = error ? accent[700] : focused ? colors.accent : hovered ? colors.textWash45 : colors.divider;
  return (
    <View style={styles.field}>
      <Text size={12} color={colors.textMuted70} style={styles.label}>
        {label}
      </Text>
      <View onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={neutral[600]}
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
          style={[styles.input, { borderColor: border }, style]}
        />
      </View>
      {error ? (
        <Text size={12} color={accent[700]} accessibilityLiveRegion="polite" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 5 },
  label: { lineHeight: 16 },
  input: {
    height: 48,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: colors.surface,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.text,
    outlineStyle: 'none',
  } as object,
});
