import { Bonjour } from 'bonjour-service';

/**
 * Anuncia o hub na rede local como `_nuvigia._tcp` (página de pareamento e,
 * no futuro, conexão direta quando o app estiver em casa).
 */
export function announce(opts: { name: string; port: number; hubId: string; version: string }): () => void {
  const bonjour = new Bonjour();
  bonjour.publish({ name: `${opts.name} (${opts.hubId.slice(0, 4)})`, type: 'nuvigia', protocol: 'tcp', port: opts.port, txt: { id: opts.hubId, v: opts.version } });
  return () => {
    bonjour.unpublishAll(() => bonjour.destroy());
  };
}
