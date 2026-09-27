export type FactionId = 0 | 1 | 2; // bass | mid | high

export interface FactionMeta {
  id: FactionId;
  name: string;
  color: string;
  bind: string;
}

/** Three-color territory war — orange / green / purple. */
export const FACTIONS: FactionMeta[] = [
  { id: 0, name: 'Bass', color: '#FF6A1A', bind: 'bass · blob' },
  { id: 1, name: 'Mid', color: '#1AFF9A', bind: 'mid · tendril' },
  { id: 2, name: 'High', color: '#B44DFF', bind: 'high · spark' },
];

export interface EffectStats {
  id: FactionId;
  name: string;
  share: number;
}

/** Kept for Engine typing compatibility (no combos in territory mode). */
export type WarEffectId = 'bass' | 'mid' | 'high';
export type WarComboId = 'territory';

export const WAR_EFFECTS = FACTIONS.map((f) => ({
  id: (['bass', 'mid', 'high'] as const)[f.id] as WarEffectId,
  name: f.name,
  bind: f.bind,
  kind: 'scene' as const,
}));

export const WAR_COMBOS = [
  {
    id: 'territory' as WarComboId,
    name: 'Territory',
    effects: ['bass', 'mid', 'high'] as WarEffectId[],
  },
];
