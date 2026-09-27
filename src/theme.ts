export type AppMode = 'signals' | 'wars' | 'flat2d';

export const COLORS = {
  bg: '#050508',
  fg: '#e8efe9',
  muted: '#7a8a82',
  accentSignals: '#A8FF00',
  accentWars: '#FF4D00',
  accentFlat: '#00E5FF',
} as const;

export function accentForMode(mode: AppMode): string {
  if (mode === 'wars') return COLORS.accentWars;
  if (mode === 'flat2d') return COLORS.accentFlat;
  return COLORS.accentSignals;
}

export function applyModeTheme(mode: AppMode): void {
  document.documentElement.dataset.mode = mode;
  document.documentElement.style.setProperty(
    '--echo-accent',
    accentForMode(mode),
  );
}
