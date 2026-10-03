import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email("E-mail inválido."),
  acceptTerms: z.boolean().refine(val => val === true, "Você deve aceitar os Termos de Uso.")
});

export const loginSchema = z.object({
  email: z.string().email("E-mail inválido."),
  password: z.string().min(1, "A senha é obrigatória."),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
