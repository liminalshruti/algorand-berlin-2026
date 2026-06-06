// Reza's lane — owns this file.
import type { RouteOption } from './contract';

export function trustScore(_opt: RouteOption): number { return 0; }
export function weightedPick(_opts: RouteOption[]): RouteOption | null { return null; }
