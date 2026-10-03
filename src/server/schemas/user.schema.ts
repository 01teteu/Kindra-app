import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido.").max(255, "E-mail muito longo."),
});

export type RegisterInput = z.infer<typeof registerSchema>;
