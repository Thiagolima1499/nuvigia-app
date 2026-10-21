import { createElement } from 'react';

const fill = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' } as const;

export function RecordingVideo({ url }: { url: string }) {
  return createElement('video', { src: url, controls: true, autoPlay: true, playsInline: true, style: fill });
}
