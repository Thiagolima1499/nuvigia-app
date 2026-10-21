import { cameraFromNotification } from '@/services/push';

describe('notificações', () => {
  it('toque na notificação abre a câmera certa', () => {
    const response = { notification: { request: { content: { data: { cameraId: 'cam-1', eventId: 'e1' } } } } };
    expect(cameraFromNotification(response as never)).toBe('cam-1');
    expect(cameraFromNotification(null)).toBeNull();
    expect(cameraFromNotification({ notification: { request: { content: { data: {} } } } } as never)).toBeNull();
  });
});
