// Shayaun's lane — owns this file. Stub so server boots at H0.
import { Hono } from 'hono';
import type { Ctx } from './contract';

export function makeValidationRoutes(_ctx: Ctx): Hono {
  const router = new Hono();
  // Shayaun: add POST /api/validate and GET /api/reputation here
  return router;
}
