import type { LucideIcon } from 'lucide-react-native';

import { colors, icon } from '@/theme/theme';

export type IconProps = {
  icon: LucideIcon;
  size?: number;
  color?: string;
};

/** Ícone Lucide com o traço padrão do Organic (2.75). */
export function Icon({ icon: Glyph, size = 20, color = colors.text }: IconProps) {
  return <Glyph size={size} color={color} strokeWidth={icon.strokeWidth} absoluteStrokeWidth={false} />;
}
