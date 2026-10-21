import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { BottomSheet, Button, DialogBody, Radio, RadioGroup, useToast } from '@/components/ui';
import { PROVIDER_ORDER, PROVIDERS } from '@/data/providers';
import { cloudLogin, CloudLoginError } from '@/services/cloudAuth';
import { useAppStore } from '@/state/store';
import { space } from '@/theme/theme';

/**
 * Diálogo "Onde salvar as gravações?". Fica na raiz do app e abre por `openCloudDialog()`.
 * No modo real, "Entrar com …" abre o login do provedor e entrega o resultado ao hub;
 * no modo demonstração, só simula.
 */
export function CloudDialog() {
  const toast = useToast();
  const { open, pick } = useAppStore((s) => s.cloudDialog);
  const setPick = useAppStore((s) => s.setDialogPick);
  const close = useAppStore((s) => s.closeCloudDialog);
  const connect = useAppStore((s) => s.connectCloud);
  const linkCloud = useAppStore((s) => s.linkCloud);
  const live = useAppStore((s) => s.mode === 'live');
  const [busy, setBusy] = useState(false);
  const p = PROVIDERS[pick];

  const onConnect = async () => {
    if (!live) {
      connect(pick);
      toast.show(`${p.name} conectado`);
      return;
    }
    setBusy(true);
    try {
      const command = await cloudLogin(pick);
      if (!command) return; // a pessoa cancelou o login
      await linkCloud(command);
      toast.show(`${p.name} conectado`);
    } catch (e) {
      toast.show(e instanceof CloudLoginError ? e.message : e instanceof Error && e.message === 'hub_timeout' ? 'O hub não respondeu. Tente de novo.' : `Não foi possível conectar ao ${p.name}.`);
    } finally {
      setBusy(false);
    }
  };

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
            label={busy ? 'Conectando…' : p.cta}
            disabled={busy}
            onPress={() => void onConnect()}
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
