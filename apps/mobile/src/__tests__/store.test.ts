import { useAppStore } from '@/state/store';

const get = () => useAppStore.getState();

beforeEach(() => get().reset());

describe('store', () => {
  it('começa com os dados do protótipo', () => {
    expect(get().cameras.map((c) => c.name)).toEqual(['Sala de estar', 'Portão', 'Quintal', 'Garagem']);
    expect(get().cloud).toBe('google');
    expect(get().cameras.filter((c) => c.recording)).toHaveLength(1);
  });

  it('parar a gravação cria um clipe enviando', () => {
    get().stopRecording('cam-sala');
    const [rec] = get().recordings;
    expect(rec).toMatchObject({ cameraId: 'cam-sala', status: 'uploading', uploadProgress: 0, provider: 'google' });
    expect(get().cameras.find((c) => c.id === 'cam-sala')?.recording).toBe(false);
  });

  it('envios avançam até concluir', () => {
    for (let i = 0; i < 40; i++) get().tickUploads();
    const rec = get().recordings.find((r) => r.id === 'rec-1');
    expect(rec).toMatchObject({ status: 'done', uploadProgress: 100 });
  });

  it('sem nuvem os envios não avançam', () => {
    get().disconnectCloud();
    get().tickUploads();
    expect(get().recordings.find((r) => r.id === 'rec-1')?.uploadProgress).toBe(64);
  });

  it('diálogo abre com o provedor pré-selecionado e conecta', () => {
    get().openCloudDialog('icloud');
    expect(get().cloudDialog).toEqual({ open: true, pick: 'icloud' });
    get().connectCloud('icloud');
    expect(get().cloud).toBe('icloud');
    expect(get().cloudDialog.open).toBe(false);
  });

  it('adiciona câmera online', () => {
    const id = get().addCamera({ name: 'Cozinha', room: 'Térreo', model: 'Tapo C200', ip: '192.168.0.41', uploadToCloud: true });
    expect(get().cameras.find((c) => c.id === id)).toMatchObject({ name: 'Cozinha', online: true, recording: false });
  });

  it('modo de gravação vale para todas as câmeras', () => {
    get().setRecordMode('continuous');
    expect(get().cameras.every((c) => c.recordMode === 'continuous')).toBe(true);
  });
});
