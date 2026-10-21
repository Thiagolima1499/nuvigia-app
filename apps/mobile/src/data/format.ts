const pad = (n: number) => String(n).padStart(2, '0');

/** HH:MM:SS */
export function formatClock(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** DD/MM */
export function formatDayMonth(d: Date): string {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

/** MM:SS (cronômetro de gravação). Passa de 59 minutos sem virar hora, como no protótipo. */
export function formatElapsed(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

/** "1 min 12 s", "48 s" */
export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${r} s`;
  return `${m} min ${pad(r)} s`;
}

/** "Hoje, 14:32" / "Ontem, 22:17" / "18/10, 09:41" */
export function formatWhen(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diffDays === 0) return `Hoje, ${time}`;
  if (diffDays === 1) return `Ontem, ${time}`;
  return `${formatDayMonth(d)}, ${time}`;
}

/** HH:MM */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "38,2 GB", "1 TB" (padrão brasileiro, vírgula decimal). */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  const rounded = Math.round(v * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',');
  return `${text} ${units[i]}`;
}

export function greeting(d: Date): string {
  const h = d.getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}
