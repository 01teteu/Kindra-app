import { z } from 'zod';
import { timeContextSchema } from './nutrition.schema.js';

export const MealCategoryEnum = z.enum(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'], {
  message: 'Categoria de refeição inválida. Escolha entre BREAKFAST, LUNCH, DINNER ou SNACK.'
});

export const addMealEntrySchema = z.object({
  category: MealCategoryEnum,
  foodId: z.string().uuid('ID do alimento inválido.'),
  amountGrams: z
    .number({ message: 'A quantidade em gramas é obrigatória e deve ser um número.' })
    .positive('A quantidade deve ser maior que zero.')
    .min(1, 'A quantidade mínima é de 1g.')
    .max(3000, 'A quantidade máxima permitida por porção é de 3000g (3kg) para prevenir entradas irreais.')
}).merge(timeContextSchema);

export type AddMealEntryInput = z.infer<typeof addMealEntrySchema>;
