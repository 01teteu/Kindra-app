import { z } from 'zod';
import { ACTIVITY_LEVEL_OPTIONS, GOAL_OPTIONS, BIOLOGICAL_SEX_OPTIONS } from '../../shared/onboardingOptions';

export const profileSchema = z.object({
  firstName: z.string().min(2, 'O nome deve ter pelo menos 2 caracteres.').max(100, 'O nome não pode exceder 100 caracteres.'),
  lastName: z.string().min(2, 'O sobrenome deve ter pelo menos 2 caracteres.').max(100, 'O sobrenome não pode exceder 100 caracteres.'),
  birthDate: z.string().max(30, 'Data inválida.').refine((date) => !isNaN(Date.parse(date)), {
    message: 'Data de nascimento inválida.',
  }),
  biologicalSex: z.enum(BIOLOGICAL_SEX_OPTIONS, { message: 'Selecione o sexo biológico.' }),
  weightKg: z.number().positive('O peso deve ser um valor positivo.'),
  heightCm: z.number().positive('A altura deve ser um valor positivo.'),
  activityLevel: z.enum(ACTIVITY_LEVEL_OPTIONS, { message: 'Selecione um nível de atividade válido.' }),
  goal: z.enum(GOAL_OPTIONS, { message: 'Selecione um objetivo válido.' }),
  isPCD: z.boolean(),
  allergies: z.array(z.string().max(50, 'A opção não pode exceder 50 caracteres.')),
  limitations: z.array(z.string().max(50, 'A opção não pode exceder 50 caracteres.')),
});

export type ProfileInput = z.infer<typeof profileSchema>;
