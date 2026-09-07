import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido.").max(255, "E-mail muito longo."),
  password: z.string().min(1, "A senha é obrigatória.").max(100, "Senha muito longa."),
});

export const resendVerificationSchema = z.object({});

export const confirmVerificationSchema = z.object({
  token: z.string().min(1, "O token de verificação é obrigatório.").max(255, "Token muito longo."),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido.").max(255, "E-mail muito longo."),
});

export const verifyResetCodeSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido.").max(255, "E-mail muito longo."),
  token: z.string().min(6, "O código deve ter 6 dígitos.").max(6, "O código deve ter 6 dígitos."),
});

export const resetPasswordSchema = z.object({
  password: z
    .string()
    .min(8, "Mínimo de 8 caracteres.")
    .max(100, "Senha muito longa.")
    .regex(/[A-Z]/, "Pelo menos uma letra maiúscula.")
    .regex(/[a-z]/, "Pelo menos uma letra minúscula.")
    .regex(/[0-9]/, "Pelo menos um número.")
    .regex(/[^A-Za-z0-9]/, "Pelo menos um caractere especial."),
  confirmPassword: z.string().min(1, "Confirme sua senha.").max(100, "Senha muito longa."),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem.",
  path: ["confirmPassword"],
});

export const changeEmailSchema = z.object({
  newEmail: z.string().trim().toLowerCase().email("Novo e-mail inválido.").max(255, "E-mail muito longo."),
});

export const checkEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido.").max(255, "E-mail muito longo."),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
export type ConfirmVerificationInput = z.infer<typeof confirmVerificationSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type VerifyResetCodeInput = z.infer<typeof verifyResetCodeSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;
export type CheckEmailInput = z.infer<typeof checkEmailSchema>;

export const googleAuthSchema = z.object({
  credential: z.string().min(1, "Token do Google é obrigatório.").max(5000, "Token muito longo.")
});

export type GoogleAuthInput = z.infer<typeof googleAuthSchema>;
