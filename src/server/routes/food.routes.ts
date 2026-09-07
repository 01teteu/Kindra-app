import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import prisma from '../db.js';
import { requireScope } from '../middlewares/auth.js';
import { addCustomFoodSchema } from '../schemas/food.schema.js';
import { Prisma } from '@prisma/client';

export const foodRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', requireScope('session'));

  fastify.get('/', async (request, reply) => {
    try {
      const querySchema = z.object({
        search: z.string().max(100).optional()
      });

      const { search } = querySchema.parse(request.query);
      const userId = (request as any).user.id;
      const normalizedSearch = search?.trim().toLowerCase();

      const foods = await prisma.food.findMany({
        where: {
          AND: [
            {
              OR: [
                { isCustom: false },
                { userId: userId }
              ]
            },
            ...(normalizedSearch ? [{ name: { contains: normalizedSearch } }] : [])
          ]
        },
        take: 50,
        orderBy: { name: 'asc' }
      });

      return reply.send(foods);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.issues[0].message });
      }
      console.error('[GET /foods error]', error);
      return reply.status(500).send({ error: 'Erro ao buscar catálogo de alimentos.' });
    }
  });

  // POST /api/foods -> Cadastro de alimento customizado
  fastify.post('/', {
    config: {
      rateLimit: {
        max: 5, // Máximo de 5 alimentos criados por usuário
        timeWindow: '1 hour' // Por hora
      }
    }
  }, async (request, reply) => {
    try {
      const userId = (request as any).user.id;
      const data = addCustomFoodSchema.parse(request.body);
      
      const normalizedName = data.name.trim().toLowerCase();

      const food = await prisma.food.create({
        data: {
          userId,
          name: normalizedName,
          isCustom: true, // Força segurança no backend
          kcal: data.kcal,
          proteinG: data.proteinG,
          carbsG: data.carbsG,
          fatG: data.fatG,
        }
      });

      return reply.status(201).send(food);

    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.issues[0].message });
      }
      
      // Tratamento de colisão de Unique Constraint (P2002)
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const userId = (request as any).user.id;
        const body = request.body as any;
        const conflictName = body.name ? body.name.trim().toLowerCase() : '';

        // Descobre quem é o dono do alimento conflitante para dar a mensagem correta
        const existing = await prisma.food.findUnique({
          where: { name: conflictName }
        });

        if (existing) {
          if (existing.isCustom === false) {
            return reply.status(400).send({ error: `O alimento "${conflictName}" já existe no banco de dados oficial (TACO). Você pode buscá-lo diretamente na lista.` });
          }
          if (existing.userId === userId) {
            return reply.status(400).send({ error: `Você já cadastrou um alimento com o nome "${conflictName}".` });
          }
          return reply.status(400).send({ error: `Este nome exato ("${conflictName}") já está em uso no sistema. Por favor, adicione um identificador para diferenciá-lo (ex: "${conflictName} (minha receita)").` });
        }
      }

      console.error('[POST /foods error]', error);
      return reply.status(500).send({ error: 'Erro ao cadastrar alimento customizado.' });
    }
  });
};
