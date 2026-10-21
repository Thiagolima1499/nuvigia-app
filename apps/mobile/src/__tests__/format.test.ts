import { formatBytes, formatClock, formatDuration, formatElapsed, formatWhen, greeting } from '@/data/format';

describe('formatação', () => {
  it('relógio e cronômetro', () => {
    expect(formatClock(new Date(2026, 9, 21, 7, 5, 9))).toBe('07:05:09');
    expect(formatElapsed(754)).toBe('12:34');
  });
  it('duração como no protótipo', () => {
    expect(formatDuration(72)).toBe('1 min 12 s');
    expect(formatDuration(48)).toBe('48 s');
    expect(formatDuration(123)).toBe('2 min 03 s');
  });
  it('quando: Hoje / Ontem / data', () => {
    const now = new Date(2026, 9, 21, 15, 0);
    expect(formatWhen(new Date(2026, 9, 21, 14, 32).toISOString(), now)).toBe('Hoje, 14:32');
    expect(formatWhen(new Date(2026, 9, 20, 22, 17).toISOString(), now)).toBe('Ontem, 22:17');
    expect(formatWhen(new Date(2026, 9, 18, 9, 41).toISOString(), now)).toBe('18/10, 09:41');
  });
  it('cota em GB/TB com vírgula', () => {
    expect(formatBytes(38.2e9)).toBe('38,2 GB');
    expect(formatBytes(100e9)).toBe('100 GB');
    expect(formatBytes(1000e9)).toBe('1 TB');
  });
  it('saudação por horário', () => {
    expect(greeting(new Date(2026, 0, 1, 9))).toBe('Bom dia');
    expect(greeting(new Date(2026, 0, 1, 13))).toBe('Boa tarde');
    expect(greeting(new Date(2026, 0, 1, 20))).toBe('Boa noite');
  });
});
