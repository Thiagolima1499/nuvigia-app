import { ScrollView, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, space } from '@/theme/theme';

export type ScreenProps = {
  children: React.ReactNode;
  /** Largura máxima do conteúdo (1080/880/640/560). */
  maxWidth: number;
  /** Espaço extra na base (ex.: 110 para a barra de abas). */
  bottomInset?: number;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Container de tela: fundo `bg`, safe areas e margem lateral
 * `max(17.6px, (largura − máx) / 2)`, centralizando o conteúdo em tablets.
 */
export function Screen({ children, maxWidth, bottomInset = space[4], scroll = true, contentStyle, testID }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const sideL = Math.max(space[4] + insets.left, (width - maxWidth) / 2);
  const sideR = Math.max(space[4] + insets.right, (width - maxWidth) / 2);
  const padding: ViewStyle = {
    paddingTop: insets.top + space[4],
    paddingBottom: insets.bottom + bottomInset,
    paddingLeft: sideL,
    paddingRight: sideR,
  };
  if (!scroll) return <View testID={testID} style={[styles.root, padding, contentStyle]}>{children}</View>;
  return (
    <ScrollView testID={testID} style={styles.root} contentContainerStyle={[padding, contentStyle]} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
