import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido.").max(255, "E-mail muito longo."),
  password: z
    .string()
    .min(8, "Mínimo de 8 caracteres.")
    .max(100, "Senha muito longa.")
    .regex(/[A-Z]/, "Pelo menos uma letra maiúscula.")
    .regex(/[a-z]/, "Pelo menos uma letra minúscula.")
    .regex(/[0-9]/, "Pelo menos um número.")
    .regex(/[^A-Za-z0-9]/, "Pelo menos um caractere especial."),
});

export type RegisterInput = z.infer<typeof registerSchema>;
