import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import prisma from '../db.js';
import { requireScope } from '../middlewares/auth.js';
import { addMealEntrySchema } from '../schemas/meal.schema.js';
import { timeContextQuerySchema } from '../schemas/nutrition.schema.js';
import { validatePlausibility, getDayBounds } from '../utils/timezone.js';

export const mealRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', requireScope('session'));

  // POST /api/meals/entries -> Agrupa ou Cria Refeição e adiciona o Alimento
  fastify.post('/entries', async (request, reply) => {
    try {
      const data = addMealEntrySchema.parse(request.body);
      validatePlausibility(data.referenceDate, data.timezoneOffset);

      const userId = (request as any).user.id;

      // 1. Validar se o Alimento existe e pertence ao catálogo do usuário ou global
      const food = await prisma.food.findFirst({
        where: {
          id: data.foodId,
          OR: [
            { isCustom: false },
            { userId: userId }
          ]
        }
      });

      if (!food) {
        return reply.status(403).send({ error: 'Alimento não encontrado ou sem permissão de acesso.' });
      }

      // 2. Determinar as bordas de "Hoje" baseadas no fuso do usuário
      const { startOfDayUTC, endOfDayUTC } = getDayBounds(data.referenceDate, data.timezoneOffset);

      // 3. Buscar ou Criar a Categoria de Refeição para o Dia (Upsert semântico)
      let meal = await prisma.meal.findFirst({
        where: {
          userId,
          name: data.category,
          loggedAt: {
            gte: startOfDayUTC,
            lte: endOfDayUTC
          }
        }
      });

      if (!meal) {
        // Se a Meal não existe hoje, nós criamos e cravamos no 'startOfDay' para manter organização de query
        meal = await prisma.meal.create({
          data: {
            userId,
            name: data.category,
            loggedAt: startOfDayUTC
          }
        });
      } else {
        // Trava Anti-DoS (Data Growth Abuse): Limite máximo de 50 itens por refeição
        const currentEntriesCount = await prisma.mealEntry.count({
          where: { mealId: meal.id }
        });
        
        if (currentEntriesCount >= 50) {
          return reply.status(400).send({ error: 'Limite de 50 alimentos excedido para esta refeição. Remova alguns itens para continuar.' });
        }
      }

      // 4. Adicionar o Alimento à Refeição
      const entry = await prisma.mealEntry.create({
        data: {
          mealId: meal.id,
          foodId: food.id,
          amountGrams: data.amountGrams
        }
      });

      return reply.status(201).send({ message: 'Alimento adicionado à refeição com sucesso.', entry });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.issues[0].message });
      }
      if (error.message && error.message.includes('tolerância')) {
        return reply.status(400).send({ error: error.message });
      }
      console.error('[POST /meals/entries error]', error);
      return reply.status(500).send({ error: 'Erro ao registrar refeição.' });
    }
  });

  // DELETE /api/meals/entries/:id -> Remove um Alimento da Refeição
  fastify.delete('/entries/:id', async (request, reply) => {
    try {
      const entryId = (request.params as any).id;
      const userId = (request as any).user.id;

      // 1. Check if entry exists and belongs to the user
      const entry = await prisma.mealEntry.findFirst({
        where: {
          id: entryId,
          meal: {
            userId: userId // Secure validation: ensure the parent meal belongs to this user
          }
        },
        include: {
          meal: true // Need meal data to check the date
        }
      });

      if (!entry) {
        return reply.status(404).send({ error: 'Alimento não encontrado ou sem permissão de acesso.' });
      }

      // 1.5. Proteção de Ofensiva (Business Logic Firewall): Impedir deleção de dias que já foram consolidados
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { lastActiveDay: true } });
      if (user?.lastActiveDay) {
        const lastActiveAbstractDate = new Date(user.lastActiveDay);
        // We compare the UTC time of the meal with the abstract midnight time of the user's last active day
        // This is safe because meal.loggedAt is always forced to startOfDayUTC in the POST route
        if (entry.meal.loggedAt.getTime() < lastActiveAbstractDate.getTime()) {
           return reply.status(403).send({ error: 'Não é possível remover alimentos de dias passados cujo histórico (ofensiva) já foi consolidado.' });
        }
      }

      // 2. Delete the entry
      await prisma.mealEntry.delete({
        where: { id: entry.id }
      });

      return reply.send({ message: 'Alimento removido com sucesso.' });
    } catch (error) {
      console.error('[DELETE /meals/entries/:id error]', error);
      return reply.status(500).send({ error: 'Erro ao remover alimento da refeição.' });
    }
  });

  // GET /api/meals -> Retorna as refeições consolidadas de um dia específico
  fastify.get('/', async (request, reply) => {
    try {
      const { referenceDate, timezoneOffset } = timeContextQuerySchema.parse(request.query);
      validatePlausibility(referenceDate, timezoneOffset);

      const userId = (request as any).user.id;
      const { startOfDayUTC, endOfDayUTC } = getDayBounds(referenceDate, timezoneOffset);

      const meals = await prisma.meal.findMany({
        where: {
          userId,
          loggedAt: {
            gte: startOfDayUTC,
            lte: endOfDayUTC
          }
        },
        include: {
          entries: {
            include: {
              food: true
            },
            orderBy: { createdAt: 'asc' } // Ordem que o usuário adicionou
          }
        },
        orderBy: { loggedAt: 'asc' }
      });

      return reply.send(meals);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.issues[0].message });
      }
      if (error.message && error.message.includes('tolerância')) {
        return reply.status(400).send({ error: error.message });
      }
      console.error('[GET /meals error]', error);
      return reply.status(500).send({ error: 'Erro ao buscar as refeições.' });
    }
  });
};
