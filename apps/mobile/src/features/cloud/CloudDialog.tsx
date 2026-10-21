import { StyleSheet } from 'react-native';

import { BottomSheet, Button, DialogBody, Radio, RadioGroup, useToast } from '@/components/ui';
import { PROVIDER_ORDER, PROVIDERS } from '@/data/providers';
import { useAppStore } from '@/state/store';
import { space } from '@/theme/theme';

/**
 * Diálogo "Onde salvar as gravações?". Fica na raiz do app e abre por `openCloudDialog()`.
 * Nesta etapa o "Entrar com …" é simulado; o OAuth real entra na etapa 5.
 */
export function CloudDialog() {
  const toast = useToast();
  const { open, pick } = useAppStore((s) => s.cloudDialog);
  const setPick = useAppStore((s) => s.setDialogPick);
  const close = useAppStore((s) => s.closeCloudDialog);
  const connect = useAppStore((s) => s.connectCloud);
  const p = PROVIDERS[pick];

  return (
    <BottomSheet
      visible={open}
      onClose={close}
      title="Onde salvar as gravações?"
      actions={
        <>
          <Button label="Agora não" variant="secondary" onPress={close} />
          <Button
            testID="cloud-dialog-cta"
            label={p.cta}
            onPress={() => {
              connect(pick);
              toast.show(`${p.name} conectado`);
            }}
          />
        </>
      }
    >
      <RadioGroup accessibilityLabel="Provedor de nuvem" style={styles.options}>
        {PROVIDER_ORDER.map((id) => (
          <Radio
            key={id}
            appearance="pill"
            label={PROVIDERS[id].name}
            note={PROVIDERS[id].note}
            selected={pick === id}
            onPress={() => setPick(id)}
          />
        ))}
      </RadioGroup>
      <DialogBody>
        {pick === 'icloud' ? 'Você vai entrar com sua Conta Apple. ' : ''}O Nuvigia vai criar a pasta “Nuvigia” no {p.name} e salvar nela apenas vídeos e
        fotos das suas câmeras.
      </DialogBody>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  options: { gap: space[2] },
});
