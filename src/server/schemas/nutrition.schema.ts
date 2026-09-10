import { z } from 'zod';

export const timeContextSchema = z.object({
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de data inválido. Use YYYY-MM-DD'),
  timezoneOffset: z.number({ message: 'O timezoneOffset (em minutos) é obrigatório.' })
    .int('O timezoneOffset deve ser um número inteiro.')
    .min(-720, 'Fuso horário irreal. Mínimo permitido é UTC-12 (-720).')
    .max(840, 'Fuso horário irreal. Máximo permitido é UTC+14 (+840).')
});

export const timeContextQuerySchema = z.object({
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de data inválido. Use YYYY-MM-DD'),
  timezoneOffset: z.coerce.number({ message: 'O timezoneOffset (em minutos) é obrigatório.' })
    .refine((val) => !isNaN(val), 'Fuso horário inválido (NaN).')
    .pipe(z.number().int().min(-720, 'Fuso horário irreal. Mínimo permitido é UTC-12 (-720).').max(840, 'Fuso horário irreal. Máximo permitido é UTC+14 (+840).'))
});

export const weightLogSchema = z.object({
  weightKg: z
    .number({ message: 'O peso deve ser um número e é obrigatório' })
    .min(20, 'O peso mínimo aceitável é 20kg (prevenção contra inputs irreais).')
    .max(400, 'O peso máximo aceitável é 400kg.'),
  loggedAt: z.string().datetime().optional()
}).merge(timeContextSchema);

export const waterIntakeLogSchema = z.object({
  amountMl: z
    .number({ message: 'A quantidade de água deve ser um número inteiro e é obrigatória' })
    .int('A quantidade deve ser um número inteiro')
    .min(10, 'O registro mínimo é de 10ml.')
    .max(2000, 'Máximo de 2000ml por registro individual para evitar fraudes ou erros de digitação.'),
  loggedAt: z.string().datetime().optional()
}).merge(timeContextSchema);

export type WeightLogInput = z.infer<typeof weightLogSchema>;
export type WaterIntakeLogInput = z.infer<typeof waterIntakeLogSchema>;
