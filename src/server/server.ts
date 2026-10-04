import 'dotenv/config';
import Fastify from 'fastify';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import middie from '@fastify/middie';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { userRoutes } from './routes/user.routes.js';
import { authRoutes } from './routes/auth.routes.js';
import { profileRoutes } from './routes/profile.routes.js';
import { workoutRoutes } from './routes/workout.routes.js';
import { nutritionRoutes } from './routes/nutrition.routes.js';
import { foodRoutes } from './routes/food.routes.js';
import { mealRoutes } from './routes/meal.routes.js';
import { resolveJwtSecret } from './security/jwt-secret.js';
import { resolveTrustedProxies } from './security/trusted-proxies.js';
import { resolveGoogleClientId } from './security/google-client-id.js';
import { resolveTransactionalEmailConfig } from './services/transactional-email.provider.js';

const projectRoot = process.cwd();
const spaRoutes = new Set([
  '/', '/register', '/login', '/forgot-password', '/verify-email', '/verificar-email', '/onboarding',
  '/home', '/nutri', '/settings', '/settings/nutrition', '/workout', '/workout/progress',
  '/routines/new', '/workout/live', '/workout/exercises',
]);

function isKnownSpaRoute(pathname: string) {
  const normalized = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  return spaRoutes.has(normalized) || /^\/routines\/[^/]+\/edit$/.test(normalized);
}

async function startServer() {
  resolveGoogleClientId();
  resolveTransactionalEmailConfig();
  const jwtSecret = resolveJwtSecret(process.env.JWT_SECRET, process.env.NODE_ENV);
  const trustedProxies = resolveTrustedProxies(process.env.TRUSTED_PROXIES);
  const fastify = Fastify({ 
    logger: true,
    trustProxy: trustedProxies
  });

  const configuredPort = process.env.PORT ?? '3000';
  const PORT = Number(configuredPort);
  if (!/^\d+$/.test(configuredPort) || !Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
    throw new Error('PORT deve ser um número entre 1 e 65535.');
  }

  await fastify.register(fastifyCookie, {
    secret: process.env.COOKIE_SECRET || 'super_secret_cookie_fallback',
  });

  // 0. Autenticação JWT
  await fastify.register(fastifyJwt, {
    secret: jwtSecret,
    cookie: {
      cookieName: 'token',
      signed: false
    }
  });

  // 1. Rate limiting global
  await fastify.register(fastifyRateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // 2. Registro das rotas da API
  await fastify.register(userRoutes, { prefix: '/api/users' });
  await fastify.register(authRoutes, { prefix: '/api/auth' });
  await fastify.register(profileRoutes, { prefix: '/api/profile' });
  await fastify.register(workoutRoutes, { prefix: '/api/workouts' });
  await fastify.register(nutritionRoutes, { prefix: '/api/nutrition' });
  await fastify.register(foodRoutes, { prefix: '/api/foods' });
  await fastify.register(mealRoutes, { prefix: '/api/meals' });


  // 3. Configuração para servir o Frontend (React/Vite) na mesma porta
  if (process.env.NODE_ENV !== 'production') {
    // Modo DEV: Integra os middlewares do Vite
    await fastify.register(middie);
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    
    fastify.use((req, res, next) => {
      if (req.url && req.url.startsWith('/api')) {
        next();
      } else {
        vite.middlewares(req, res, next);
      }
    });
  } else {
    // Modo PROD: Serve arquivos estáticos pré-compilados do dist/
    await fastify.register(fastifyStatic, {
      root: path.join(projectRoot, 'dist'),
      prefix: '/',
    });

    fastify.setNotFoundHandler((request, reply) => {
      let pathname = '';
      try {
        pathname = decodeURIComponent(new URL(request.raw.url ?? request.url, 'http://kindra.local').pathname);
      } catch {
        return reply.status(404).send({ error: 'Not Found' });
      }
      const acceptsHtml = request.headers.accept?.split(',').some(value => value.trim().split(';')[0] === 'text/html');
      const isSpaNavigation = request.method === 'GET' && acceptsHtml && isKnownSpaRoute(pathname);
      if (isSpaNavigation) return reply.sendFile('index.html');
      return reply.status(404).send({ error: 'Not Found' });
    });
  }

  // 4. Inicializa o servidor
  try {
    await fastify.listen({ port: PORT, host: '::' });
    console.log(`[Fastify] Servidor rodando em http://localhost:${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

startServer();
