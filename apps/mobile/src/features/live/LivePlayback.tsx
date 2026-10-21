import type { Recording } from '@nuvigia/shared';
import { useEffect, useState } from 'react';
import { Image, Linking, StyleSheet, View } from 'react-native';

import { Button, Spinner, Text } from '@/components/ui';
import { PROVIDERS } from '@/data/providers';
import { useAppStore } from '@/state/store';
import { neutral, radius, space } from '@/theme/theme';

import { RecordingVideo } from './RecordingVideo';

type Link = { url: string; kind: 'stream' | 'web' };

/**
 * Gravação no modo real: se o arquivo ainda está no hub e há túnel, toca aqui;
 * senão, oferece abrir no site do provedor (Drive/OneDrive).
 */
export function LivePlayback({ rec, height }: { rec: Recording; height: number }) {
  const remote = useAppStore((s) => s.remote);
  const [link, setLink] = useState<Link | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    remote
      ?.send({ type: 'recordingLink', recordingId: rec.id })
      .then((r) => !cancelled && setLink(r as Link))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [remote, rec.id]);

  const provider = rec.provider ? PROVIDERS[rec.provider] : null;

  return (
    <View style={[styles.box, { height }]} accessibilityLabel="Vídeo da gravação">
      {link?.kind === 'stream' ? (
        rec.kind === 'photo' ? (
          <Image source={{ uri: link.url }} resizeMode="contain" style={StyleSheet.absoluteFill} accessibilityLabel="Foto da câmera" />
        ) : (
          <RecordingVideo url={link.url} />
        )
      ) : link?.kind === 'web' ? (
        <View style={styles.center}>
          <Text size={14} color={neutral[100]} style={styles.text}>
            Esta gravação está no {provider?.name ?? 'provedor'}.
          </Text>
          <Button label={`Abrir no ${provider?.short ?? 'provedor'}`} onPress={() => void Linking.openURL(link.url)} testID="open-provider" />
        </View>
      ) : failed ? (
        <View style={styles.center}>
          <Text size={14} weight="semibold" color={neutral[100]} style={styles.text}>
            Não dá para assistir esta gravação pelo app.
          </Text>
          <Text size={13} color={neutral[200]} style={styles.text}>
            {provider ? `Abra a pasta Nuvigia no ${provider.name}.` : 'Ela ficou só no hub.'} Para assistir aqui, configure o endereço público do hub (veja o guia de instalação).
          </Text>
        </View>
      ) : (
        <View style={styles.center}>
          <Spinner size={24} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: '100%', borderRadius: radius.lg, overflow: 'hidden', backgroundColor: neutral[800] },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: space[3], padding: space[4] },
  text: { textAlign: 'center' },
});
