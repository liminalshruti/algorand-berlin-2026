// Reza's lane — owns this file. Stub so server boots at H0.
import { Hono } from 'hono';
import type { Ctx } from './contract.js';
import { discover, discoveryOptions, providerIdentity } from './providers.js';
import { v4 as uuidv4 } from 'uuid';

type RouteBody = {
  task?: string;
  register?: string;
};

export function makeProviderRoutes(ctx: Ctx): Hono {
  const router = new Hono();

  router.get('/api/providers', (c) => {
    const register = c.req.query('register') ?? 'Diligence';
    const providers = discover(ctx.providers.values(), register).map(providerIdentity);
    return c.json({ register, providers });
  });

  router.post('/api/route', async (c) => {
    const body: RouteBody = await c.req.json<RouteBody>().catch(() => ({}));
    const register = body.register ?? 'Diligence';
    const task = body.task ?? '';
    const providers = discover(ctx.providers.values(), register);

    if (providers.length === 0) {
      return c.json({ error: `No providers for register: ${register}` }, 400);
    }

    const route_id = uuidv4();
    const options = discoveryOptions(providers, route_id);

    ctx.routeStore.set(route_id, { route_id, task, options });

    return c.json({
      route_id,
      task,
      register,
      options,
    });
  });

  return router;
}
