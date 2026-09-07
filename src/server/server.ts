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

const projectRoot = process.cwd();

async function startServer() {
  const fastify = Fastify({ 
    logger: true,
    trustProxy: true
  });

  const PORT = 3000;

  await fastify.register(fastifyCookie, {
    secret: process.env.COOKIE_SECRET || 'super_secret_cookie_fallback',
  });

  // 0. Autenticação JWT
  await fastify.register(fastifyJwt, {
    secret: process.env.JWT_SECRET || 'super_secret_fallback',
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
      reply.sendFile('index.html');
    });
  }

  // 4. Inicializa o servidor
  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`[Fastify] Servidor rodando em http://localhost:${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

startServer();
