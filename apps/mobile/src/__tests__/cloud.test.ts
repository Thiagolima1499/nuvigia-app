import { parseCkToken, reverseClientId } from '@/services/cloudAuth';
import { useAppStore, type Remote } from '@/state/store';

describe('login da nuvem', () => {
  it('monta o esquema de retorno do Google', () => {
    expect(reverseClientId('123-abc.apps.googleusercontent.com')).toBe('com.googleusercontent.apps.123-abc');
  });

  it('lê o ckWebAuthToken do retorno da Apple', () => {
    expect(parseCkToken('nuvigia://oauth/icloud?ckWebAuthToken=ab%2Bc%2Fd&x=1')).toBe('ab+c/d');
    expect(parseCkToken('nuvigia://oauth/icloud#ckWebAuthToken=xyz')).toBe('xyz');
    expect(parseCkToken('nuvigia://oauth/icloud')).toBeNull();
  });
});

describe('nuvem no modo real', () => {
  beforeEach(() => useAppStore.getState().reset());

  it('entrega o login ao hub e fecha o diálogo', async () => {
    const sent: unknown[] = [];
    const remote: Remote = {
      send: async (c, t) => {
        sent.push({ c, t });
        return { account: 'ana@gmail.com' };
      },
      updateSettings: async () => undefined,
      updateCamera: async () => undefined,
      deleteRecording: async () => undefined,
    };
    const s = useAppStore.getState();
    s.attachRemote('hub-1', remote);
    s.openCloudDialog('google');
    await useAppStore.getState().linkCloud({ type: 'connectCloud', provider: 'google', code: 'c', codeVerifier: 'v', redirectUri: 'r', clientId: 'id' });
    expect(sent).toEqual([{ c: { type: 'connectCloud', provider: 'google', code: 'c', codeVerifier: 'v', redirectUri: 'r', clientId: 'id' }, t: 60_000 }]);
    expect(useAppStore.getState().cloud).toBe('google');
    expect(useAppStore.getState().cloudDialog.open).toBe(false);
  });

  it('progresso do hub só avança e para em 99 até o banco confirmar', () => {
    const s = useAppStore.getState();
    s.setRecordings([{ id: 'r1', cameraId: 'c', startedAt: new Date().toISOString(), durationSec: 30, kind: 'video', uploadProgress: 20, status: 'uploading' }]);
    s.setUploadProgress('r1', 10);
    expect(useAppStore.getState().recordings[0]!.uploadProgress).toBe(20);
    s.setUploadProgress('r1', 100);
    expect(useAppStore.getState().recordings[0]!.uploadProgress).toBe(99);
  });
});
