// Reza's lane — owns this file.
import type { Provider } from './contract.js';

export function registerProvider(_p: Provider): void {}
export function discover(_task: string): Provider[] { return []; }
