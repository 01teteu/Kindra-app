import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as service from '../services/weekly-training.service.js';
import * as schema from '../schemas/weekly-training.schema.js';

function fail(reply: FastifyReply, error: unknown) {
  if (error instanceof z.ZodError) return reply.status(400).send({ error: error.issues[0].message, details: error.format() });
  if (error instanceof service.WeeklyTrainingError) return reply.status(error.statusCode).send({ error: error.message });
  reply.log.error(error, 'Weekly training operation failed');
  return reply.status(500).send({ error: 'Erro ao executar operação no plano' });
}

export async function createPlan(req: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (req.user as { id: string }).id;
    return reply.status(201).send(await service.createPlan(userId, schema.createPlanSchema.parse(req.body)));
  } catch (error) { return fail(reply, error); }
}

export async function generatePlan(req: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (req.user as { id: string }).id;
    const { trainingDaysPerWeek, equipment } = schema.generatePlanSchema.parse(req.body);
    return reply.status(201).send(await service.generatePlan(userId, { trainingDaysPerWeek, equipment }));
  } catch (error) { return fail(reply, error); }
}

export async function listPlans(req: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (req.user as { id: string }).id;
    return reply.status(200).send(await service.listPlans(userId));
  } catch (error) { return fail(reply, error); }
}

export async function getActivePlan(req: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (req.user as { id: string }).id;
    return reply.status(200).send(await service.getActivePlan(userId));
  } catch (error) { return fail(reply, error); }
}

export async function getPlan(req: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (req.user as { id: string }).id;
    return reply.status(200).send(await service.getPlan(userId, schema.planParamsSchema.parse(req.params).planId));
  } catch (error) { return fail(reply, error); }
}

export async function renamePlan(req: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (req.user as { id: string }).id;
    return reply.status(200).send(await service.renamePlan(userId, schema.planParamsSchema.parse(req.params).planId, schema.renamePlanSchema.parse(req.body).name));
  } catch (error) { return fail(reply, error); }
}

export async function activatePlan(req: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (req.user as { id: string }).id;
    schema.activatePlanSchema.parse(req.body ?? {});
    return reply.status(200).send(await service.activatePlan(userId, schema.planParamsSchema.parse(req.params).planId));
  } catch (error) { return fail(reply, error); }
}

export async function setDay(req: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (req.user as { id: string }).id;
    const params = schema.planDayParamsSchema.parse(req.params);
    return reply.status(200).send(await service.setDay(userId, params.planId, params.dayOfWeek, schema.routineAssignmentSchema.parse(req.body).routineId));
  } catch (error) { return fail(reply, error); }
}

export async function removeDay(req: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (req.user as { id: string }).id;
    const params = schema.planDayParamsSchema.parse(req.params);
    return reply.status(200).send(await service.removeDay(userId, params.planId, params.dayOfWeek));
  } catch (error) { return fail(reply, error); }
}
