import { sessionCookieOptions } from '../session-cookie.js';
import { randomUUID } from 'node:crypto';
import { validateActiveSession } from '../middlewares/auth.js';
import { InvalidSessionError, type SessionClaims } from '../security/session-token.js';
import { FastifyRequest, FastifyReply } from 'fastify';
import { loginSchema, resendVerificationSchema, confirmVerificationSchema, forgotPasswordSchema, verifyResetCodeSchema, resetPasswordSchema } from '../schemas/auth.schema.js';
import * as authService from '../services/auth.service.js';
import prisma from '../db.js';

export async function loginController(req: FastifyRequest, reply: FastifyReply) {
  const parsed = loginSchema.safeParse(req.body);
  
  if (!parsed.success) {
    return reply.status(400).send({
      error: parsed.error.issues[0].message,
      details: parsed.error.format(),
    });
  }

  try {
    const { sessionVersion, ...userPayload } = await authService.login(parsed.data);
    
    // Gerar JWT
    const token = await reply.jwtSign({
      id: userPayload.id,
      role: userPayload.role,
      scope: 'session',
      sessionVersion,
      jti: randomUUID(),
    }, { expiresIn: '24h' });

    // Setar Cookie HttpOnly
    reply.setCookie('token', token, {
      ...sessionCookieOptions(),
      maxAge: 60 * 60 * 24 // 24 hours
    });

    return reply.send({
      message: 'Login realizado com sucesso',
      user: userPayload
    });
  } catch (error: any) {
    if (error.message === 'INVALID_CREDENTIALS') {
      return reply.status(401).send({ error: 'Credenciais inválidas.' });
    }
    
    console.error('[Login Error]', error);
    return reply.status(500).send({ error: 'Erro interno no servidor' });
  }
}

export async function logoutController(req: FastifyRequest, reply: FastifyReply) {
  const success = () => {
    reply.clearCookie('token', sessionCookieOptions());
    return reply.send({ message: 'Logout realizado com sucesso' });
  };

  // Preserve the existing idempotent 200 response for absent, expired and
  // otherwise invalid credentials. Never accept a temporary JWT as a session.
  try {
    await req.jwtVerify();
  } catch {
    return success();
  }
  const claims = req.user as SessionClaims;
  if (claims.scope && claims.scope !== 'session') return success();

  try {
    const current = await validateActiveSession(req, claims);
    await prisma.revokedSessionToken.createMany({
      data: [{ tokenHash: current.tokenHash, userId: current.userId, expiresAt: current.expiresAt }],
      skipDuplicates: true,
    });
  } catch (error) {
    if (error instanceof InvalidSessionError) return success();
    // Do not claim a successful logout or clear the cookie if persistence
    // failed: the JWT might otherwise remain usable without the user's notice.
    return reply.status(503).send({ error: 'Não foi possível encerrar a sessão. Tente novamente.' });
  }
  return success();
}

export async function meController(req: FastifyRequest, reply: FastifyReply) {
  try {
    // Para funcionar, essa rota deve passar pelo auth middleware e decodificar o usuário no `req.user`
    const { id } = req.user as { id: string };
    
    // Podemos usar o prisma aqui ou um serviço. Como é rápido, vamos puxar pelo db:
    const user = await prisma.user.findUnique({
      where: { id },
      include: { profile: true }
    });

    if (!user) {
      return reply.status(401).send({ error: 'Usuário não encontrado' });
    }

    return reply.send({
      id: user.id,
      email: user.email,
      role: user.role,
      hasProfile: !!user.profile,
      profile: user.profile || null
    });
  } catch (error) {
    return reply.status(401).send({ error: 'Não autorizado' });
  }
}

export async function resendVerificationController(req: FastifyRequest, reply: FastifyReply) {
  const parsed = resendVerificationSchema.safeParse(req.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.issues[0].message });
  const generic = { message: 'Se este endereço puder ser verificado, enviaremos instruções para continuar.' };

  try {
    await authService.resendVerificationEmailService(parsed.data.email, (id, challengeId, email) => reply.jwtSign({
      id, scope: 'pending_verification', challengeId, email,
    }, { expiresIn: '20m' }));
    return reply.send(generic);
  } catch (error: any) {
    console.error('[Resend Email Error]', error);
    return reply.status(500).send({ error: 'Erro interno no servidor' });
  }
}

export async function confirmVerificationController(req: FastifyRequest, reply: FastifyReply) {
  const parsed = confirmVerificationSchema.safeParse(req.body);
  
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.issues[0].message });
  }

  try {
    const { id, challengeId } = req.user as { id?: string; challengeId?: string };
    if (!id || !challengeId) return reply.status(401).send({ error: 'Token inválido.' });
    const { sessionVersion, ...userPayload } = await authService.verifyEmailToken(id, challengeId, parsed.data);

    // Auto-Login: Gerar JWT
    const token = await reply.jwtSign({
      id: userPayload.id,
      role: userPayload.role,
      scope: 'session',
      sessionVersion,
      jti: randomUUID(),
    }, { expiresIn: '24h' });

    // Setar Cookie HttpOnly
    reply.setCookie('token', token, {
      ...sessionCookieOptions(),
      maxAge: 60 * 60 * 24 // 24 hours
    });

    return reply.send({
      message: 'E-mail verificado com sucesso!',
      user: userPayload
    });
  } catch (error: any) {
    if (error.message === 'INVALID_TOKEN') {
      return reply.status(400).send({ error: 'Token inválido ou inexistente.' });
    }
    if (error.message === 'TOKEN_EXPIRED') {
      return reply.status(400).send({ error: 'O token expirou. Solicite um novo envio.' });
    }
    if (error.message === 'TOKEN_REISSUE_REQUIRED') {
      return reply.status(400).send({ error: 'Este código precisa ser substituído. Solicite um novo código para continuar.' });
    }
    if (error.message === 'MAX_VALIDATION_ATTEMPTS') {
      return reply.status(429).send({ error: 'Limite de tentativas atingido. Solicite um novo código.' });
    }
    
    console.error('[Verify Email Error]', error);
    return reply.status(500).send({ error: 'Erro interno no servidor' });
  }
}


export async function forgotPasswordController(req: FastifyRequest, reply: FastifyReply) {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.issues[0].message });
  }

  const genericResponse = { message: 'Se o e-mail existir e estiver verificado, você receberá um código de redefinição.' };
  try {
    await authService.forgotPasswordService(parsed.data.email);
    return reply.send(genericResponse);
  } catch (error: any) {
    // Account-specific eligibility and cooldown must not be observable publicly.
    if (error.message === 'GOOGLE_USER_NO_PASSWORD' ||
        error.message === 'MAX_ATTEMPTS_REACHED' ||
        error.message === 'COOLDOWN_ACTIVE') {
      return reply.send(genericResponse);
    }
    console.error('[Forgot Password Error]', error);
    return reply.status(500).send({ error: 'Erro interno no servidor' });
  }
}

export async function verifyResetCodeController(req: FastifyRequest, reply: FastifyReply) {
  const parsed = verifyResetCodeSchema.safeParse(req.body);
  
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.issues[0].message });
  }

  try {
    const { user, challengeId, resetGrantId } = await authService.verifyResetCodeService(parsed.data);
    
    // Create a temporary JWT specifically for resetting the password (15 min)
    const resetToken = await reply.jwtSign({
      id: user.id,
      scope: 'reset_password',
      challengeId,
      resetGrantId,
    }, { expiresIn: '15m' });

    return reply.send({
      message: 'Código verificado com sucesso.',
      resetToken
    });
  } catch (error: any) {
    if (error.message === 'INVALID_TOKEN' || error.message === 'TOKEN_ALREADY_USED') {
      return reply.status(400).send({ error: 'Código inválido ou já utilizado.' });
    }
    if (error.message === 'MAX_VALIDATION_ATTEMPTS') {
      return reply.status(429).send({ error: 'Limite de tentativas atingido. Solicite um novo código.' });
    }
    if (error.message === 'TOKEN_EXPIRED') {
      return reply.status(400).send({ error: 'O código expirou. Solicite um novo envio.' });
    }
    
    console.error('[Verify Reset Code Error]', error);
    return reply.status(500).send({ error: 'Erro interno no servidor' });
  }
}

export async function resetPasswordController(req: FastifyRequest, reply: FastifyReply) {
  const parsed = resetPasswordSchema.safeParse(req.body);
  
  if (!parsed.success) {
    return reply.status(400).send({ 
      error: parsed.error.issues[0].message,
      details: parsed.error.format()
    });
  }

  try {
    const { id, challengeId, resetGrantId } = req.user as {
      id?: string; challengeId?: string; resetGrantId?: string;
    };
    if (!id || !challengeId || !resetGrantId) {
      return reply.status(401).send({ error: 'Token inválido.' });
    }

    await authService.resetPasswordService(id, challengeId, resetGrantId, parsed.data.password);
    return reply.send({ message: 'Senha alterada com sucesso.' });
  } catch (error: any) {
    if (error.message === 'INVALID_RESET_GRANT') {
      return reply.status(401).send({ error: 'Token inválido ou já utilizado.' });
    }
    if (error.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED' || error.message.includes('expired')) {
      return reply.status(401).send({ error: 'O tempo para redefinir a senha expirou. Comece o processo novamente.' });
    }
    if (error.code === 'FST_JWT_AUTHORIZATION_TOKEN_INVALID' || error.message.includes('invalid') || error.message.includes('malformed')) {
      return reply.status(401).send({ error: 'Token inválido.' });
    }
    if (error.message === 'USER_NOT_FOUND') {
      return reply.status(404).send({ error: 'Usuário não encontrado.' });
    }
    
    console.error('[Reset Password Error]', error);
    return reply.status(500).send({ error: 'Erro interno no servidor' });
  }
}

export async function changeUnverifiedEmailController(req: FastifyRequest, reply: FastifyReply) {
  const { changeEmailSchema } = await import('../schemas/auth.schema.js');
  
  const parsed = changeEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.issues[0].message, details: parsed.error.format() });
  }

  const { id, challengeId } = req.user as { id?: string; challengeId?: string };
  if (!id || !challengeId) return reply.status(401).send({ error: 'Token inválido.' });

  try {
    const user = await prisma.user.findUnique({ where: { id } });
    
    if (!user || user.emailVerified) {
      return reply.send({ message: 'E-mail alterado e novo código enviado com sucesso.' });
    }

    await authService.changeUnverifiedEmailService(id, challengeId, parsed.data.newEmail, (userId, nextChallengeId, email) => reply.jwtSign({
      id: userId, scope: 'pending_verification', challengeId: nextChallengeId, email,
    }, { expiresIn: '20m' }));
    return reply.send({ message: 'E-mail alterado e novo código enviado com sucesso.' });
  } catch (error: any) {
    if (error.message === 'EMAIL_ALREADY_VERIFIED') {
      return reply.send({ message: 'E-mail alterado e novo código enviado com sucesso.' });
    }
    if (error.message === 'MAX_ATTEMPTS_REACHED') {
      return reply.status(429).send({ error: 'Muitas tentativas. Por segurança, o reenvio foi bloqueado.' });
    }
    if (error.message === 'INVALID_TOKEN') return reply.status(401).send({ error: 'Token inválido.' });
    console.error('[Change Email Error]', error);
    return reply.status(500).send({ error: 'Erro interno no servidor' });
  }
}

export async function googleAuthController(req: FastifyRequest, reply: FastifyReply) {
  const { googleAuthSchema } = await import('../schemas/auth.schema.js');
  
  const parsed = googleAuthSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.issues[0].message });
  }

  try {
    const { sessionVersion, ...userPayload } = await authService.loginWithGoogle(parsed.data);

    // Gerar JWT
    const token = await reply.jwtSign({
      id: userPayload.id,
      role: userPayload.role,
      scope: 'session',
      sessionVersion,
      jti: randomUUID(),
    }, { expiresIn: '24h' });

    // Setar Cookie HttpOnly
    reply.setCookie('token', token, {
      ...sessionCookieOptions(),
      maxAge: 60 * 60 * 24 // 24 hours
    });

    return reply.send({
      message: 'Login com Google realizado com sucesso',
      user: userPayload
    });
  } catch (error: any) {
    console.error('[Google Auth Error]', error);
    if (error.message === 'GOOGLE_OAUTH_NOT_CONFIGURED') {
      return reply.status(503).send({ error: 'Login com Google indisponível neste ambiente.' });
    }
    if (error.message === 'INVALID_GOOGLE_TOKEN') {
      return reply.status(401).send({ error: 'Autenticação do Google falhou.' });
    }
    return reply.status(500).send({ error: 'Erro interno no servidor ao autenticar com Google.' });
  }
}
