import { FastifyRequest, FastifyReply } from 'fastify';
import { profileSchema, updateProfileSchema, updateProfileQuerySchema } from '../schemas/profile.schema.js';
import { validatePlausibility } from '../utils/timezone.js';
import * as profileService from '../services/profile.service.js';
import { calculateAndSaveNutritionGoal } from '../services/nutrition.service.js';

export async function getOptionsController(req: FastifyRequest, reply: FastifyReply) {
  try {
    const options = await profileService.getCatalogOptions();
    return reply.send(options);
  } catch (error: any) {
    console.error('[ProfileOptions Error]', error);
    return reply.status(500).send({ error: 'Erro interno no servidor' });
  }
}

export async function createProfileController(req: FastifyRequest, reply: FastifyReply) {
  const parsed = profileSchema.safeParse(req.body);
  
  if (!parsed.success) {
    return reply.status(400).send({
      error: 'VALIDATION_ERROR',
      details: parsed.error.format(),
    });
  }

  try {
    const userId = (req.user as any).id;
    
    if (!userId) {
      return reply.status(401).send({ error: 'Não autorizado' });
    }

    const profile = await profileService.createProfile(userId, parsed.data);
    
    // Dispara o cálculo automático da meta nutricional (efeito colateral, não deve bloquear)
    try {
      await calculateAndSaveNutritionGoal(userId);
    } catch (nutritionError) {
      console.error('[Onboarding] Falha não-crítica ao calcular metas nutricionais:', nutritionError);
      // Silencioso. O usuário poderá recalcular manualmente na aba Nutri.
    }
    
    return reply.status(201).send({
      message: 'Perfil criado com sucesso',
      profile,
    });
  } catch (error: any) {
    if (error.message === 'PROFILE_ALREADY_EXISTS') {
      return reply.status(409).send({ error: 'O perfil deste usuário já foi criado.' });
    }
    
    console.error('[CreateProfile Error]', error);
    return reply.status(500).send({ error: 'Erro interno no servidor' });
  }
}


export async function getProfileController(req: FastifyRequest, reply: FastifyReply) {
  const userId = (req.user as { id?: string }).id;
  if (!userId) return reply.status(401).send({ error: 'Não autorizado' });
  try {
    return reply.send(await profileService.getEditableProfile(userId));
  } catch (error) {
    if (error instanceof profileService.ProfileUpdateError) return reply.status(error.status).send({ error: error.message });
    return reply.status(500).send({ error: 'Não foi possível carregar seu perfil.' });
  }
}

export async function updateProfileController(req: FastifyRequest, reply: FastifyReply) {
  const userId = (req.user as { id?: string }).id;
  if (!userId) return reply.status(401).send({ error: 'Não autorizado' });
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.issues[0].message, details: parsed.error.format() });
  }
  const context = updateProfileQuerySchema.safeParse(req.query);
  if (!context.success) return reply.status(400).send({ error: 'Atualize a página para enviar uma data e um fuso válidos.' });
  const { referenceDate, timezoneOffset } = context.data;
  try {
    validatePlausibility(referenceDate, timezoneOffset);
    const localToday = new Date(Date.now() - timezoneOffset * 60000).toISOString().slice(0, 10);
    if (referenceDate !== localToday) throw new Error('Not today');
  } catch {
    return reply.status(400).send({ error: 'A atualização deve usar a data de hoje. Atualize a página e tente novamente.' });
  }
  try {
    const result = await profileService.updateProfile(userId, parsed.data, referenceDate, timezoneOffset);
    return reply.send({ message: 'Respostas atualizadas e metas recalculadas.', ...result });
  } catch (error) {
    if (error instanceof profileService.ProfileUpdateError) return reply.status(error.status).send({ error: error.message });
    console.error('[UpdateProfile] Falha na transação de atualização.');
    return reply.status(500).send({ error: 'Não foi possível salvar. Nenhuma alteração foi aplicada; tente novamente.' });
  }
}
