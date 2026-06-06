// Reza's lane — owns this file. Stub so server boots at H0.
import { Hono } from 'hono';
import type { Ctx } from './contract';

export function makeProviderRoutes(_ctx: Ctx): Hono {
  const router = new Hono();
  // Reza: add POST /api/route here
  return router;
}
