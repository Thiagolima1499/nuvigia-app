import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AddCameraScreen from '@/app/adicionar';
import CamerasScreen from '@/app/(tabs)/index';
import SettingsScreen from '@/app/(tabs)/ajustes';
import { ToastProvider } from '@/components/ui';
import { CloudDialog } from '@/features/cloud/CloudDialog';
import { useAppStore } from '@/state/store';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({}) }));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const wrap = (ui: React.ReactElement) =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ToastProvider>
        {ui}
        <CloudDialog />
      </ToastProvider>
    </SafeAreaProvider>,
  );

beforeEach(() => {
  useAppStore.getState().reset();
  jest.clearAllMocks();
});

describe('Câmeras', () => {
  it('lista as câmeras e a faixa da nuvem', async () => {
    await wrap(<CamerasScreen />);
    expect(screen.getByText('Minhas câmeras')).toBeOnTheScreen();
    expect(screen.getByText('Salvando no Google Drive')).toBeOnTheScreen();
    expect(screen.getByText('1 gravando agora · 38,2 GB de 100 GB')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Garagem, sem conexão' })).toBeOnTheScreen();
  });

  it('câmera offline mostra aviso; online abre Ao vivo', async () => {
    await wrap(<CamerasScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Garagem, sem conexão' }));
    expect(screen.getByText('Garagem está sem conexão')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Portão, ao vivo' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/camera/cam-portao');
  });

  it('sem nuvem mostra "Escolha onde salvar"', async () => {
    useAppStore.getState().disconnectCloud();
    await wrap(<CamerasScreen />);
    expect(screen.getByText('Escolha onde salvar')).toBeOnTheScreen();
  });

  it('estados de vazio e hub inacessível', async () => {
    useAppStore.getState().simulate({ cameras: [] });
    const { unmount } = await wrap(<CamerasScreen />);
    expect(screen.getByText('Nenhuma câmera ainda')).toBeOnTheScreen();
    await unmount();
    useAppStore.getState().simulate({ hubStatus: 'unreachable' });
    await wrap(<CamerasScreen />);
    expect(screen.getByText('Hub inacessível')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeOnTheScreen();
  });
});

describe('Ajustes', () => {
  it('trocar de provedor pelo diálogo', async () => {
    await wrap(<SettingsScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'OneDrive, não conectado' }));
    expect(screen.getByText('Onde salvar as gravações?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Entrar com Microsoft' }));
    expect(useAppStore.getState().cloud).toBe('onedrive');
    expect(screen.getByText('OneDrive conectado')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Desconectar OneDrive' })).toBeOnTheScreen();
  });
});

describe('Adicionar câmera', () => {
  it('valida a senha e conecta', async () => {
    jest.useFakeTimers();
    await wrap(<AddCameraScreen />);
    expect(screen.getByText('Passo 1 de 3')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Adicionar por IP ou QR code' }));
    expect(screen.getByText('Passo 2 de 3')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Endereço IP ou URL RTSP'), '192.168.0.50');
    await fireEvent.press(screen.getByRole('button', { name: 'Conectar câmera' }));
    expect(screen.getByText('A senha precisa ter ao menos 8 caracteres.')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Senha do Wi‑Fi Casa_5G'), '12345678');
    await fireEvent.press(screen.getByRole('button', { name: 'Conectar câmera' }));
    expect(screen.getByText('Passo 3 de 3')).toBeOnTheScreen();
    jest.useRealTimers();
  });
});
