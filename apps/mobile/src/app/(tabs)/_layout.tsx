import { Tabs } from 'expo-router';

import { TabBar, type TabKey } from '@/components/ui';
import { colors } from '@/theme/theme';

const ROUTE_BY_TAB: Record<TabKey, string> = { cameras: 'index', recordings: 'gravacoes', settings: 'ajustes' };
const TAB_BY_ROUTE: Record<string, TabKey> = { index: 'cameras', gravacoes: 'recordings', ajustes: 'settings' };

/** Abas Câmeras, Gravações e Ajustes com a barra flutuante do design. */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
      tabBar={({ state, navigateToTab }) => {
        const route = state.routes[state.index];
        const active = TAB_BY_ROUTE[route?.name ?? 'index'] ?? 'cameras';
        return (
          <TabBar
            active={active}
            onChange={(key) => {
              const target = state.routes.find((r) => r.name === ROUTE_BY_TAB[key]);
              if (target) navigateToTab(target.key);
            }}
          />
        );
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Câmeras' }} />
      <Tabs.Screen name="gravacoes" options={{ title: 'Gravações' }} />
      <Tabs.Screen name="ajustes" options={{ title: 'Ajustes' }} />
    </Tabs>
  );
}
