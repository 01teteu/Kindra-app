import { z } from 'zod';

export const profileSchema = z.object({
  firstName: z.string().min(2, 'O nome deve ter pelo menos 2 caracteres.'),
  lastName: z.string().min(2, 'O sobrenome deve ter pelo menos 2 caracteres.'),
  birthDate: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: 'Data de nascimento inválida.',
  }),
  weightKg: z.number().positive('O peso deve ser um valor positivo.'),
  heightCm: z.number().positive('A altura deve ser um valor positivo.'),
  activityLevel: z.string().min(1, 'Selecione um nível de atividade.'),
  goal: z.string().min(1, 'Selecione um objetivo.'),
  isPCD: z.boolean(),
  allergies: z.array(z.string()),
  limitations: z.array(z.string()),
});

export type ProfileInput = z.infer<typeof profileSchema>;
