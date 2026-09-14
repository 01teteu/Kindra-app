import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { removeWaterParamsSchema, removeWaterQuerySchema } from '../schemas/nutrition.schema.js';
import { removeWaterLog } from '../services/water.service.js';
import { validatePlausibility } from '../utils/timezone.js';

export async function removeWater(request: FastifyRequest, reply: FastifyReply) {
  const params = removeWaterParamsSchema.safeParse(request.params);
  const query = removeWaterQuerySchema.safeParse(request.query);
  if (!params.success || !query.success || request.body !== undefined) {
    return reply.status(400).send({ error: 'Informe um registro válido, a data e o fuso horário, sem corpo na requisição.' });
  }

  // Fail closed even if a malformed session JWT was issued elsewhere.
  const identity = z.object({ id: z.string().uuid(), scope: z.literal('session') }).safeParse(request.user);
  if (!identity.success) return reply.status(401).send({ error: 'Sessão inválida.' });

  const { referenceDate, timezoneOffset } = query.data;
  try {
    validatePlausibility(referenceDate, timezoneOffset);
  } catch {
    return reply.status(400).send({ error: 'Data de referência fora da janela de tolerância permitida.' });
  }
  const localToday = new Date(Date.now() - timezoneOffset * 60_000).toISOString().slice(0, 10);
  if (referenceDate !== localToday) {
    return reply.status(400).send({ error: 'Somente registros do dia atual podem ser removidos. Atualize a página.' });
  }

  try {
    const removed = await removeWaterLog(identity.data.id, params.data.id, referenceDate, timezoneOffset);
    if (!removed) {
      // Same response for another user's ID, missing, repeated, old or consolidated records.
      return reply.status(404).send({ error: 'Registro não disponível para remoção. Atualize os registros de hoje.' });
    }
    return reply.status(204).send();
  } catch {
    return reply.status(500).send({ error: 'Não foi possível remover o registro. Tente novamente.' });
  }
}
