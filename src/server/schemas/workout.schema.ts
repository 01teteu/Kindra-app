import { z } from 'zod';

export const createRoutineSchema = z.object({
  name: z.string().trim().min(1, 'O nome da rotina é obrigatório').max(100, 'Nome muito longo'),
  exercises: z.array(z.object({
    exerciseId: z.string().uuid('ID de exercício inválido'),
    order: z.number().int().nonnegative(),
    notes: z.string().max(500, 'Anotação muito longa').optional().nullable()
  }))
});

export type CreateRoutineInput = z.infer<typeof createRoutineSchema>;
