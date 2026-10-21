import { useState } from 'react';

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
      onFocus: () => setFocused(true),
      onBlur: () => setFocused(false),
    },
  };
}
