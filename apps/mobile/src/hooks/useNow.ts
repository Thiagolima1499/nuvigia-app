import { useEffect, useState } from 'react';

/** Data atual, atualizada a cada `intervalMs` (relógio e cronômetro: 1s). */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
