import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { space } from '@/theme/theme';

/** Largura útil do conteúdo dentro de `Screen` (mesma regra de margem lateral). */
export function useContentWidth(maxWidth: number): number {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sideL = Math.max(space[4] + insets.left, (width - maxWidth) / 2);
  const sideR = Math.max(space[4] + insets.right, (width - maxWidth) / 2);
  return Math.max(0, width - sideL - sideR);
}

/**
 * Equivalente a `grid-template-columns: repeat(auto-fill, minmax(min(100%, MIN), 1fr))`.
 * Devolve o número de colunas e a largura de cada item.
 */
export function useAutoFillGrid(maxWidth: number, minItem: number, gap: number) {
  const content = useContentWidth(maxWidth);
  const columns = Math.max(1, Math.floor((content + gap) / (Math.min(minItem, content) + gap)));
  const itemWidth = (content - gap * (columns - 1)) / columns;
  return { columns, itemWidth, contentWidth: content };
}
