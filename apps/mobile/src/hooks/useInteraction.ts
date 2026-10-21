import { useState } from 'react';
import { Platform } from 'react-native';

/** Na web, só mostra o anel de foco quando o foco veio do teclado (`:focus-visible`). */
function isKeyboardFocus(e: unknown): boolean {
  if (Platform.OS !== 'web') return true;
  const target = (e as { target?: { matches?: (sel: string) => boolean } } | undefined)?.target;
  try {
    return target?.matches?.(':focus-visible') ?? false;
  } catch {
    return false;
  }
}

/**
 * Estado de hover/foco para Pressable (hover funciona na web, iPad com cursor e Android com mouse).
 * O estado "pressionado" vem do próprio Pressable.
 */
export function useInteraction() {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  return {
    hovered,
    focused,
    handlers: {
      onHoverIn: () => setHovered(true),
      onHoverOut: () => setHovered(false),
      onFocus: (e: unknown) => setFocused(isKeyboardFocus(e)),
      onBlur: () => setFocused(false),
    },
  };
}
