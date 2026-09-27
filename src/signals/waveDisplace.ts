import { Vector3 } from 'three';

/** Displacement kernels from three.js webgl_multiple_elements_text. */
export type DisplaceFn = (
  x: number,
  y: number,
  z: number,
  t: number,
  target: Vector3,
) => Vector3;

export const planeWave: DisplaceFn = (x, _y, _z, t, target) =>
  target.set(Math.sin(x - t), 0, 0);

export const cylinderWave: DisplaceFn = (x, y, _z, t, target) => {
  const rho2 = x * x + y * y;
  if (rho2 < 0.01) return target.set(0, 0, 0);
  const rho = Math.sqrt(rho2);
  const phi = Math.atan2(y, x);
  const s = (1.5 * Math.sin(rho - t)) / Math.sqrt(rho);
  return target.set(Math.cos(phi) * s, Math.sin(phi) * s, 0);
};

export const sphereWave: DisplaceFn = (x, y, z, t, target) => {
  const r2 = x * x + y * y + z * z;
  if (r2 < 0.01) return target.set(0, 0, 0);
  const r = Math.sqrt(r2);
  const theta = Math.acos(z / r);
  const phi = Math.atan2(y, x);
  const s = (3 * Math.sin(r - t)) / r;
  return target.set(
    Math.cos(phi) * Math.sin(theta) * s,
    Math.sin(phi) * Math.sin(theta) * s,
    Math.cos(theta) * s,
  );
};

/** Soft radial breath — good with cover pulse. */
export const breathWave: DisplaceFn = (x, y, z, t, target) => {
  const r = Math.sqrt(x * x + y * y + z * z) + 0.001;
  const s = Math.sin(r * 0.85 - t * 1.2) * 0.55;
  return target.set((x / r) * s, (y / r) * s, (z / r) * s);
};
