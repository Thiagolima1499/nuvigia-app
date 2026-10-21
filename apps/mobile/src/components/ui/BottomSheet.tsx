import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, maxWidth, radius, shadow, space } from '@/theme/theme';

import { Heading, Text } from './Text';

export type BottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  children?: React.ReactNode;
  /** Botões alinhados à direita no rodapé. */
  actions?: React.ReactNode;
};

/**
 * Diálogo em folha presa à base (padrão do "Onde salvar as gravações?").
 * Fundo neutro-900 a 50%, folha `min(460px, 100%)`, raio 36px.
 */
export function BottomSheet({ visible, onClose, title, children, actions }: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={[styles.backdrop, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={onClose} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={styles.sheet}>
          <Heading size={22} style={styles.title}>
            {title}
          </Heading>
          {children}
          {actions ? <View style={styles.actions}>{actions}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

/** Texto do corpo do diálogo (14px, opacidade .85). */
export function DialogBody({ children }: { children: React.ReactNode }) {
  return (
    <Text size={14} style={styles.body}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.backdrop,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  sheet: {
    width: '100%',
    maxWidth: maxWidth.dialog,
    gap: space[3],
    padding: space[4],
    borderRadius: radius.dialog,
    backgroundColor: colors.surface,
    boxShadow: shadow.lg,
  },
  title: { fontSize: 20, lineHeight: 24 },
  body: { opacity: 0.85, lineHeight: 20 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space[2], marginTop: space[2], flexWrap: 'wrap' },
});
