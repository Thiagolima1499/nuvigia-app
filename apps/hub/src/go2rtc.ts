type FetchLike = typeof fetch;

/** Nome do stream no go2rtc para uma câmera. */
export const streamName = (cameraId: string) => `cam_${cameraId.replace(/[^a-zA-Z0-9]/g, '')}`;

/**
 * Cliente da API HTTP do go2rtc, que roda ao lado do hub (docker-compose).
 * O go2rtc abre uma conexão RTSP com a câmera e a repassa para o gravador
 * (RTSP local), para o app (WebRTC) e como HLS.
 */
export class Go2rtc {
  constructor(
    private readonly baseUrl: string,
    private readonly rtspBase: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  private url(path: string, params: Record<string, string>) {
    const u = new URL(path, this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return u;
  }

  /** RTSP local do stream (sem credenciais da câmera). */
  localRtsp(cameraId: string) {
    return `${this.rtspBase.replace(/\/$/, '')}/${streamName(cameraId)}`;
  }

  async addStream(cameraId: string, src: string): Promise<void> {
    const res = await this.fetchImpl(this.url('api/streams', { name: streamName(cameraId), src }), { method: 'PUT' });
    if (!res.ok) throw new Error(`go2rtc: não aceitou o stream (${res.status})`);
  }

  async removeStream(cameraId: string): Promise<void> {
    const res = await this.fetchImpl(this.url('api/streams', { src: streamName(cameraId) }), { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw new Error(`go2rtc: falha ao remover stream (${res.status})`);
  }

  async listStreams(): Promise<string[]> {
    const res = await this.fetchImpl(this.url('api/streams', {}));
    if (!res.ok) throw new Error(`go2rtc indisponível (${res.status})`);
    return Object.keys((await res.json()) as Record<string, unknown>);
  }

  /** Foto atual da câmera em JPEG. */
  async snapshot(cameraId: string): Promise<Buffer> {
    const res = await this.fetchImpl(this.url('api/frame.jpeg', { src: streamName(cameraId) }));
    if (!res.ok) throw new Error(`go2rtc: sem imagem (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }

  /** Troca SDP com o go2rtc (oferta do app → resposta da câmera). Usado no ao vivo remoto. */
  async webrtcAnswer(cameraId: string, offerSdp: string): Promise<string> {
    const res = await this.fetchImpl(this.url('api/webrtc', { src: streamName(cameraId) }), {
      method: 'POST',
      headers: { 'content-type': 'application/sdp' },
      body: offerSdp,
    });
    if (!res.ok) throw new Error(`go2rtc: WebRTC recusado (${res.status})`);
    return res.text();
  }
}
