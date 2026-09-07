import { FastifyPluginAsync } from 'fastify';
import prisma from '../db.js';
import { weightLogSchema, waterIntakeLogSchema, timeContextQuerySchema } from '../schemas/nutrition.schema.js';
import { requireScope } from '../middlewares/auth.js';
import { calculateAndSaveNutritionGoal, checkAndConsolidateNutriHistory } from '../services/nutrition.service.js';
import { validatePlausibility, getDayBounds } from '../utils/timezone.js';

export const nutritionRoutes: FastifyPluginAsync = async (fastify) => {
  // Middleware de autenticação obrigatório: garante que apenas tokens de sessão completa acessem
  fastify.addHook('onRequest', requireScope('session'));

  // ==========================================
  // METAS NUTRICIONAIS (NUTRITION GOALS)
  // ==========================================

  // GET /api/nutrition/goals/current -> Traz a meta vigente e ativa o Gatilho Lazy de Consolidação
  fastify.get('/goals/current', async (request, reply) => {
    try {
      const userId = (request as any).user.id;
      
      const { referenceDate, timezoneOffset } = timeContextQuerySchema.parse(request.query);
      validatePlausibility(referenceDate, timezoneOffset);

      // DISPARO DO GATILHO LAZY: Verifica virada do dia, calcula streaks e limpa logs velhos silenciosamente
      await checkAndConsolidateNutriHistory(userId, referenceDate, timezoneOffset).catch(err => { 
         console.error('[Consolidação Nutri Error]', err); 
         // Não bloqueamos a request se a consolidação falhar
      });

      const goal = await prisma.nutritionGoal.findFirst({
        where: { userId },
        orderBy: { activeFrom: 'desc' }
      });
      
      if (!goal) return reply.status(404).send({ error: 'Nenhuma meta nutricional encontrada.' });
      return reply.send(goal);
    } catch (error: any) {
      if (error.errors) return reply.status(400).send({ error: error.errors[0].message });
      if (error.message.includes('tolerância')) return reply.status(400).send({ error: error.message });
      return reply.status(500).send({ error: 'Erro ao buscar meta nutricional.' });
    }
  });

  // POST /api/nutrition/goals/recalculate -> Calcula/recalcula com base no Profile
  fastify.post('/goals/recalculate', async (request, reply) => {
    try {
      const userId = (request as any).user.id;
      
      // Valida se o profile existe e tem o Sexo Biológico antes de chamar o service para retornar o 400 amigável
      const profile = await prisma.profile.findUnique({ where: { userId } });
      if (!profile) {
        return reply.status(404).send({ error: 'Perfil não encontrado para realizar o cálculo.' });
      }
      if (!profile.biologicalSex) {
        return reply.status(400).send({ error: 'Perfil incompleto: o Sexo Biológico é obrigatório para calcular as metas nutricionais com precisão. Atualize seu perfil.' });
      }

      const newGoal = await calculateAndSaveNutritionGoal(userId);
      return reply.send(newGoal);
    } catch (error) {
      console.error('[NutritionGoal Recalculate Error]', error);
      return reply.status(500).send({ error: 'Erro interno ao recalcular as metas.' });
    }
  });

  // ==========================================
  // HISTÓRICO CONSOLIDADO (DAILY HISTORY)
  // ==========================================
  fastify.get('/history', async (request, reply) => {
    try {
      const userId = (request as any).user.id;
      
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { currentStreak: true }
      });

      const history = await prisma.historyUserNutri.findMany({
        where: { userId },
        orderBy: { date: 'desc' },
        take: 30 // Últimos 30 dias
      });

      return reply.send({
        currentStreak: user?.currentStreak || 0,
        history
      });
    } catch (error) {
      return reply.status(500).send({ error: 'Erro ao buscar histórico consolidado.' });
    }
  });

  // ==========================================
  // REGISTRO DE PESO (WEIGHT LOGS)
  // ==========================================

  fastify.get('/weight', async (request, reply) => {
    try {
      const logs = await prisma.weightLog.findMany({
        where: { userId: (request as any).user.id },
        orderBy: { loggedAt: 'desc' }
      });
      return reply.send(logs);
    } catch (error) {
      return reply.status(500).send({ error: 'Erro ao buscar histórico de peso.' });
    }
  });

  fastify.post('/weight', async (request, reply) => {
    try {
      const data = weightLogSchema.parse(request.body);
      validatePlausibility(data.referenceDate, data.timezoneOffset);

      const userId = (request as any).user.id;

      const log = await prisma.weightLog.create({
        data: {
          userId,
          weightKg: data.weightKg,
          loggedAt: data.loggedAt ? new Date(data.loggedAt) : new Date()
        }
      });

      // Atualiza o peso atual no Profile automaticamente
      await prisma.profile.update({
        where: { userId },
        data: { weightKg: data.weightKg }
      });

      return reply.status(201).send(log);
    } catch (error: any) {
      if (error.errors) {
        return reply.status(400).send({ error: error.errors[0].message });
      }
      if (error.message.includes('tolerância')) return reply.status(400).send({ error: error.message });
      return reply.status(500).send({ error: 'Erro ao registrar peso.' });
    }
  });

  // ==========================================
  // CONSUMO DE ÁGUA (WATER INTAKE LOGS)
  // ==========================================

  fastify.get('/water', async (request, reply) => {
    try {
      const { referenceDate, timezoneOffset } = timeContextQuerySchema.parse(request.query);
      validatePlausibility(referenceDate, timezoneOffset);

      const userId = (request as any).user.id;
      const { startOfDayUTC, endOfDayUTC } = getDayBounds(referenceDate, timezoneOffset);
      
      const logs = await prisma.waterIntakeLog.findMany({
        where: {
          userId,
          loggedAt: { gte: startOfDayUTC, lte: endOfDayUTC }
        },
        orderBy: { loggedAt: 'desc' }
      });
      return reply.send(logs);
    } catch (error: any) {
      if (error.errors) return reply.status(400).send({ error: error.errors[0].message });
      if (error.message.includes('tolerância')) return reply.status(400).send({ error: error.message });
      return reply.status(500).send({ error: 'Erro ao buscar histórico de água.' });
    }
  });

  fastify.post('/water', async (request, reply) => {
    try {
      const data = waterIntakeLogSchema.parse(request.body);
      validatePlausibility(data.referenceDate, data.timezoneOffset);
      
      const log = await prisma.waterIntakeLog.create({
        data: {
          userId: (request as any).user.id,
          amountMl: data.amountMl,
          loggedAt: data.loggedAt ? new Date(data.loggedAt) : new Date()
        }
      });

      return reply.status(201).send(log);
    } catch (error: any) {
      if (error.errors) {
        return reply.status(400).send({ error: error.errors[0].message });
      }
      if (error.message.includes('tolerância')) return reply.status(400).send({ error: error.message });
      return reply.status(500).send({ error: 'Erro ao registrar consumo de água.' });
    }
  });
};
