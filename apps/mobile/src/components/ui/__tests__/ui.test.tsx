import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text as RNText } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Button, IconButton, Input, Radio, RadioGroup, Segmented, SwitchRow, TabBar, TOAST_DURATION_MS, ToastProvider, useToast } from '..';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const wrap = (ui: React.ReactElement) => render(<SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>);

describe('Button', () => {
  it('chama onPress e expõe o rótulo', async () => {
    const onPress = jest.fn();
    await wrap(<Button label="Conectar nuvem" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Conectar nuvem' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('não dispara quando desativado', async () => {
    const onPress = jest.fn();
    await wrap(<Button label="Salvar" onPress={onPress} disabled />);
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('IconButton', () => {
  it('tem rótulo de acessibilidade e alvo de 44px ou mais', async () => {
    await wrap(<IconButton icon={Plus} variant="primary" accessibilityLabel="Adicionar câmera" />);
    const btn = screen.getByRole('button', { name: 'Adicionar câmera' });
    expect(btn).toHaveStyle({ width: 48, height: 48 });
  });
});

describe('Segmented', () => {
  function Harness() {
    const [v, setV] = useState<'720p' | '1080p' | '2K'>('1080p');
    return <Segmented accessibilityLabel="Qualidade" options={['720p', '1080p', '2K']} value={v} onChange={setV} />;
  }
  it('marca a opção escolhida', async () => {
    await wrap(<Harness />);
    expect(screen.getByRole('radio', { name: '1080p' })).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: '2K' }));
    expect(screen.getByRole('radio', { name: '2K' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '1080p' })).not.toBeChecked();
  });
});

describe('Radio', () => {
  it('anuncia nota junto do nome', async () => {
    await wrap(
      <RadioGroup accessibilityLabel="Provedor">
        <Radio appearance="pill" label="Google Drive" note="15 GB grátis" selected onPress={() => undefined} />
      </RadioGroup>,
    );
    expect(screen.getByRole('radio', { name: 'Google Drive, 15 GB grátis' })).toBeChecked();
  });
});

describe('SwitchRow', () => {
  it('alterna ao tocar na linha', async () => {
    function Harness() {
      const [on, setOn] = useState(true);
      return <SwitchRow label="Enviar só no Wi‑Fi" hint="Não usa seus dados móveis" value={on} onValueChange={setOn} />;
    }
    await wrap(<Harness />);
    const sw = screen.getByRole('switch', { name: 'Enviar só no Wi‑Fi' });
    expect(sw).toBeChecked();
    await fireEvent.press(sw);
    expect(sw).not.toBeChecked();
  });
});

describe('Input', () => {
  it('mostra a mensagem de erro', async () => {
    await wrap(<Input label="Senha do Wi‑Fi Casa_5G" error="A senha precisa ter ao menos 8 caracteres." />);
    expect(screen.getByText('A senha precisa ter ao menos 8 caracteres.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Senha do Wi‑Fi Casa_5G')).toBeOnTheScreen();
  });
});

describe('TabBar', () => {
  it('tem as 3 abas e marca a ativa', async () => {
    const onChange = jest.fn();
    await wrap(<TabBar active="cameras" onChange={onChange} />);
    expect(screen.getByRole('tab', { name: 'Câmeras' })).toBeSelected();
    await fireEvent.press(screen.getByRole('tab', { name: 'Ajustes' }));
    expect(onChange).toHaveBeenCalledWith('settings');
  });
});

describe('Toast', () => {
  it('some após 2,2s', async () => {
    jest.useFakeTimers();
    function Trigger() {
      const toast = useToast();
      return (
        <Pressable accessibilityRole="button" onPress={() => toast.show('Foto salva no Google Drive')}>
          <RNText>Mostrar</RNText>
        </Pressable>
      );
    }
    await wrap(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Mostrar' }));
    expect(screen.getByText('Foto salva no Google Drive')).toBeOnTheScreen();
    await act(async () => {
      jest.advanceTimersByTime(TOAST_DURATION_MS + 10);
    });
    expect(screen.queryByText('Foto salva no Google Drive')).toBeNull();
    jest.useRealTimers();
  });
});
