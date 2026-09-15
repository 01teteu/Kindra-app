import { z } from 'zod';
import { trainingWeekdays } from '../../shared/weeklyTraining.js';
import { starterEquipment } from '../../shared/starterTraining.js';

export const generatePlanSchema = z.object({
  trainingDaysPerWeek: z.union([z.literal(2), z.literal(3), z.literal(4)], { message: 'Selecione 2, 3 ou 4 dias por semana.' }),
  equipment: z.array(z.enum(starterEquipment)).min(1, 'Selecione os equipamentos disponíveis.').max(starterEquipment.length)
    .refine(values => new Set(values).size === values.length, 'Equipamento repetido.'),
}).strict();

const name = z.string().trim().min(1, 'O nome do plano é obrigatório').max(100, 'Nome muito longo');
export const planParamsSchema = z.object({ planId: z.string().uuid('ID de plano inválido') });
export const planDayParamsSchema = planParamsSchema.extend({ dayOfWeek: z.enum(trainingWeekdays) });
export const routineAssignmentSchema = z.object({ routineId: z.string().uuid('ID de rotina inválido') }).strict();
export const renamePlanSchema = z.object({ name }).strict();
export const createPlanSchema = z.object({
  name,
  source: z.enum(['GENERATED', 'CUSTOM']),
  days: z.array(routineAssignmentSchema.extend({ dayOfWeek: z.enum(trainingWeekdays) })).max(7)
    .refine(days => new Set(days.map(day => day.dayOfWeek)).size === days.length, 'Dia da semana repetido').optional(),
}).strict();
export const activatePlanSchema = z.object({}).strict();
export type CreatePlanInput = z.infer<typeof createPlanSchema>;
