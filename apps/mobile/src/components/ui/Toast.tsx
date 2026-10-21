import { Check } from 'lucide-react-native';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, maxWidth, neutral, sage, shadow } from '@/theme/theme';

import { Icon } from './Icon';
import { Text } from './Text';

/** Duração do aviso na tela (README: some após 2,2s). */
export const TOAST_DURATION_MS = 2200;

type ToastApi = { show: (message: string) => void };
const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast precisa estar dentro de <ToastProvider>.');
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((msg: string) => {
    setMessage(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(''), TOAST_DURATION_MS);
  }, []);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      {message ? <ToastView message={message} /> : null}
    </ToastContext.Provider>
  );
}

/** Aviso em pílula centralizado, a `safe-area + 100px` da base. */
export function ToastView({ message }: { message: string }) {
  const insets = useSafeAreaInsets();
  const opacity = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
  }, [opacity]);
  return (
    <View pointerEvents="none" style={[styles.layer, { bottom: insets.bottom + 100 }]}>
      <Animated.View accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.toast, { opacity }]}>
        <Icon icon={Check} size={18} color={sage[400]} />
        <Text size={14} color={neutral[100]} style={styles.text}>
          {message}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 24, right: 24, alignItems: 'center', zIndex: 25 },
  toast: {
    width: '100%',
    maxWidth: maxWidth.toast,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: colors.neutral[900],
    boxShadow: shadow.lg,
  },
  text: { flex: 1 },
});
