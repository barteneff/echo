import type { EffectId } from '../ui/Flat2D';

export type FlatOpId = EffectId;

export interface FlatOpMeta {
  id: FlatOpId;
  name: string;
  bind: string;
}

/** Dirty VFX operators — compete for pixels */
export const FLAT_OPS: FlatOpMeta[] = [
  { id: 'plasma', name: 'PLASMA', bind: 'field' },
  { id: 'wave', name: 'WAVE', bind: 'bass' },
  { id: 'particles', name: 'PARTICLES', bind: 'beat' },
  { id: 'shockwave', name: 'SHOCKWAVE', bind: 'beat' },
  { id: 'lightning', name: 'LIGHTNING', bind: 'bass' },
  { id: 'spikes', name: 'SPIKES', bind: 'mid' },
  { id: 'glitch', name: 'GLITCH', bind: 'high' },
  { id: 'flash', name: 'FLASH', bind: 'drop' },
];
