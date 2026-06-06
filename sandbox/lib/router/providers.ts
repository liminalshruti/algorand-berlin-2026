// Reza's lane — owns this file.
import type { Provider } from './contract';

export function registerProvider(_p: Provider): void {}
export function discover(_task: string): Provider[] { return []; }
