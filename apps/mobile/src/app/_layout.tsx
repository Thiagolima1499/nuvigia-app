import { Caprasimo_400Regular } from '@expo-google-fonts/caprasimo';
import { Figtree_400Regular, Figtree_600SemiBold, Figtree_700Bold } from '@expo-google-fonts/figtree';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/ui';
import { CloudDialog } from '@/features/cloud/CloudDialog';
import { useAppStore } from '@/state/store';
import { colors } from '@/theme/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

/** Simula o avanço dos envios (no app real vem do hub pelo Realtime, etapa 5). */
function UploadTicker() {
  const tick = useAppStore((s) => s.tickUploads);
  useEffect(() => {
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [tick]);
  return null;
}

export default function RootLayout() {
  const [loaded, error] = useFonts({ Caprasimo_400Regular, Figtree_400Regular, Figtree_600SemiBold, Figtree_700Bold });
  const [queryClient] = useState(() => new QueryClient());

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => undefined);
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <StatusBar style="dark" />
          <UploadTicker />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="camera/[id]" />
            <Stack.Screen name="adicionar" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="catalogo" />
          </Stack>
          <CloudDialog />
        </ToastProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
