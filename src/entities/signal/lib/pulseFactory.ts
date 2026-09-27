import { PulseLattice } from '../ui/PulseLattice';
import {
  breathWave,
  cylinderWave,
  planeWave,
  sphereWave,
} from './waveDisplace';

export function createPlanePulse(): PulseLattice {
  return new PulseLattice('Plane Pulse', planeWave, {
    mode: 'lattice',
    color: '#FF6A1A',
    range: 4.8,
    pointSize: 0.52,
  });
}

export function createCylinderPulse(): PulseLattice {
  return new PulseLattice('Cylinder Pulse', cylinderWave, {
    mode: 'lattice',
    color: '#1AFF9A',
    range: 4.6,
    pointSize: 0.5,
  });
}

export function createSpherePulse(): PulseLattice {
  return new PulseLattice('Sphere Pulse', sphereWave, {
    mode: 'lattice',
    color: '#B44DFF',
    range: 4.4,
    pointSize: 0.48,
  });
}

export function createScatterPulse(): PulseLattice {
  return new PulseLattice('Scatter Pulse', breathWave, {
    mode: 'scatter',
    color: '#66DDFF',
    range: 5.0,
    pointSize: 0.45,
  });
}
