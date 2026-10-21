import { Text } from '@/components/ui';
import { neutral } from '@/theme/theme';

/** Rótulo de seção de Ajustes (13px/600, neutro-700). */
export function SectionLabel({ children }: { children: string }) {
  return (
    <Text size={13} weight="semibold" color={neutral[700]} accessibilityRole="header">
      {children}
    </Text>
  );
}
