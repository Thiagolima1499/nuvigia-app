import type { HubCommand } from '@nuvigia/shared';

export type ConnectCloud = Extract<HubCommand, { type: 'connectCloud' }>;

/**
 * O que o resto do hub precisa da nuvem. A implementação de verdade
 * (Google Drive, OneDrive e iCloud) chega na etapa 5; aqui fica a versão "sem nuvem",
 * em que tudo é guardado só no disco do hub.
 */
export interface CloudControl {
  isConnected(): boolean;
  connect(cmd: ConnectCloud): Promise<{ account?: string }>;
  disconnect(): Promise<void>;
  /** Coloca um arquivo de volta na fila de envio. */
  retry(recordingId: string): Promise<void>;
  /** Link do arquivo no site do provedor (para assistir uma gravação), se houver. */
  webLink(recordingId: string): Promise<string | null>;
  /** Um arquivo novo ficou pronto. */
  notifyFileReady(recordingId: string): void;
  start(): void;
  stop(): Promise<void>;
}

export class NoCloud implements CloudControl {
  isConnected() {
    return false;
  }
  async connect(): Promise<{ account?: string }> {
    throw new Error('cloud_unavailable');
  }
  async disconnect() {}
  async retry() {
    throw new Error('cloud_unavailable');
  }
  async webLink() {
    return null;
  }
  notifyFileReady() {}
  start() {}
  async stop() {}
}
