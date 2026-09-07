import { z } from 'zod';

export const addCustomFoodSchema = z.object({
  name: z.string()
    .trim()
    .min(3, 'O nome do alimento deve ter pelo menos 3 caracteres.')
    .max(100, 'O nome do alimento não pode exceder 100 caracteres.'),
  kcal: z.number()
    .min(0, 'A quantidade de calorias não pode ser negativa.')
    .max(900, 'O valor calórico excede o limite físico possível para 100g (max ~900kcal).'),
  proteinG: z.number()
    .min(0, 'A quantidade de proteína não pode ser negativa.')
    .max(100, 'A proteína não pode exceder 100g em uma porção de 100g.'),
  carbsG: z.number()
    .min(0, 'A quantidade de carboidratos não pode ser negativa.')
    .max(100, 'Os carboidratos não podem exceder 100g em uma porção de 100g.'),
  fatG: z.number()
    .min(0, 'A quantidade de gordura não pode ser negativa.')
    .max(100, 'A gordura não pode exceder 100g em uma porção de 100g.'),
}).refine(
  (data) => {
    const totalMacros = data.proteinG + data.carbsG + data.fatG;
    return totalMacros <= 100;
  },
  {
    message: 'A soma de Proteína, Carboidratos e Gordura não pode exceder 100g (pois a porção base é de 100g).',
    path: ['macros']
  }
);

export type AddCustomFoodInput = z.infer<typeof addCustomFoodSchema>;
