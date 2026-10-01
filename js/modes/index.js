// Mode factory
import { CalculateMode } from './calculate.js';

const REGISTRY = {
  calc: CalculateMode,
};

export function registerMode(id, cls) { REGISTRY[id] = cls; }

export function createMode(id, calc) {
  const C = REGISTRY[id] || CalculateMode;
  return new C(calc);
}
