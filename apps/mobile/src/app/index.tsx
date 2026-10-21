import { Redirect } from 'expo-router';

/** Etapa 1: o app abre no catálogo de componentes. Na etapa 2 passa a abrir em Câmeras. */
export default function Index() {
  return <Redirect href="/catalogo" />;
}
