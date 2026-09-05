import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email("E-mail inválido."),
  password: z
    .string()
    .min(8, "Mínimo de 8 caracteres.")
    .regex(/[A-Z]/, "Pelo menos uma letra maiúscula.")
    .regex(/[a-z]/, "Pelo menos uma letra minúscula.")
    .regex(/[0-9]/, "Pelo menos um número.")
    .regex(/[^A-Za-z0-9]/, "Pelo menos um caractere especial."),
  confirmPassword: z.string().min(1, "Confirme sua senha."),
  acceptTerms: z.boolean().refine(val => val === true, "Você deve aceitar os Termos de Uso.")
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem.",
  path: ["confirmPassword"],
});

export const loginSchema = z.object({
  email: z.string().email("E-mail inválido."),
  password: z.string().min(1, "A senha é obrigatória."),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
