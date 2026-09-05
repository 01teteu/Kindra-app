import { FastifyRequest, FastifyReply } from 'fastify';
import { loginSchema, resendVerificationSchema, confirmVerificationSchema, forgotPasswordSchema, verifyResetCodeSchema, resetPasswordSchema } from '../schemas/auth.schema.js';
import * as authService from '../services/auth.service.js';

export async function loginController(req: FastifyRequest, reply: FastifyReply) {
  const parsed = loginSchema.safeParse(req.body);
  
  if (!parsed.success) {
    return reply.status(400).send({
      error: parsed.error.issues[0].message,
      details: parsed.error.format(),
    });
  }

  try {
    const userPayload = await authService.login(parsed.data);
    
    // Gerar JWT
    const token = await reply.jwtSign({
      id: userPayload.id,
      role: userPayload.role,
      scope: 'session'
    }, { expiresIn: '24h' });

    // Setar Cookie HttpOnly
    reply.setCookie('token', token, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'none',
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
    if (error.message === 'EMAIL_NOT_VERIFIED') {
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      const user = await prisma.user.findUnique({ where: { email: parsed.data.email }});
      
      if (!user) {
        return reply.status(401).send({ error: 'Credenciais inválidas.' });
      }

      // Create pendingToken for verification flow
      const pendingToken = await reply.jwtSign({
        id: user.id, 
        scope: 'pending_verification'
      }, { expiresIn: '1h' });

      return reply.status(401).send({ 
        error: 'E-mail não verificado.', 
        pendingToken,
        needsVerification: true
      });
    }
    
    console.error('[Login Error]', error);
    return reply.status(500).send({ error: 'Erro interno no servidor' });
  }
}

export async function meController(req: FastifyRequest, reply: FastifyReply) {
  try {
    // Para funcionar, essa rota deve passar pelo auth middleware e decodificar o usuário no `req.user`
    const { id } = req.user as { id: string };
    
    // Podemos usar o prisma aqui ou um serviço. Como é rápido, vamos puxar pelo db:
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    
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
      hasProfile: !!user.profile
    });
  } catch (error) {
    return reply.status(401).send({ error: 'Não autorizado' });
  }
}

export async function resendVerificationController(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.user as { id: string };

  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    const user = await prisma.user.findUnique({ where: { id } });
    
    if (!user || user.emailVerified) {
      return reply.send({ message: 'Se o e-mail estiver cadastrado e não verificado, um novo link foi enviado.' });
    }

    await authService.resendVerificationEmailService(user.email);
    // Sempre retorna a mesma mensagem
    return reply.send({ message: 'Se o e-mail estiver cadastrado e não verificado, um novo link foi enviado.' });
  } catch (error: any) {
    if (error.message === 'MAX_ATTEMPTS_REACHED') {
      return reply.status(429).send({ error: 'Muitas tentativas. Por segurança, o reenvio foi bloqueado.' });
    }
    if (error.message === 'COOLDOWN_ACTIVE') {
      return reply.status(429).send({ 
        error: `Aguarde ${error.retryAfter} segundos antes de solicitar um novo código.`,
        retryAfter: error.retryAfter
      });
    }
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
    const userPayload = await authService.verifyEmailToken(parsed.data);

    // Auto-Login: Gerar JWT
    const token = await reply.jwtSign({
      id: userPayload.id,
      role: userPayload.role,
      scope: 'session'
    }, { expiresIn: '24h' });

    // Setar Cookie HttpOnly
    reply.setCookie('token', token, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'none',
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
    
    console.error('[Verify Email Error]', error);
    return reply.status(500).send({ error: 'Erro interno no servidor' });
  }
}


export async function forgotPasswordController(req: FastifyRequest, reply: FastifyReply) {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.issues[0].message });
  }

  try {
    await authService.forgotPasswordService(parsed.data.email);
    // User enumeration prevention: always generic message
    return reply.send({ message: 'Se o e-mail existir e estiver verificado, você receberá um código de redefinição.' });
  } catch (error: any) {
    if (error.message === 'MAX_ATTEMPTS_REACHED') {
      return reply.status(429).send({ error: 'Muitas tentativas. Por segurança, o reenvio foi bloqueado.' });
    }
    if (error.message === 'COOLDOWN_ACTIVE') {
      return reply.status(429).send({ 
        error: `Aguarde ${error.retryAfter} segundos antes de solicitar um novo código.`,
        retryAfter: error.retryAfter
      });
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
    const user = await authService.verifyResetCodeService(parsed.data);
    
    // Create a temporary JWT specifically for resetting the password (15 min)
    const resetToken = await reply.jwtSign({
      id: user.id,
      scope: 'reset_password'
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
    const { id } = req.user as { id: string };
    
    await authService.resetPasswordService(id, parsed.data.password);
    return reply.send({ message: 'Senha alterada com sucesso.' });
  } catch (error: any) {
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

  const { id } = req.user as { id: string };

  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    const user = await prisma.user.findUnique({ where: { id } });
    
    if (!user || user.emailVerified) {
      return reply.send({ message: 'E-mail alterado e novo código enviado com sucesso.' });
    }

    await authService.changeUnverifiedEmailService(user.email, parsed.data.newEmail);
    return reply.send({ message: 'E-mail alterado e novo código enviado com sucesso.' });
  } catch (error: any) {
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
    const userPayload = await authService.loginWithGoogle(parsed.data);

    // Gerar JWT
    const token = await reply.jwtSign({
      id: userPayload.id,
      role: userPayload.role,
      scope: 'session'
    }, { expiresIn: '24h' });

    // Setar Cookie HttpOnly
    reply.setCookie('token', token, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'none',
      maxAge: 60 * 60 * 24 // 24 hours
    });

    return reply.send({
      message: 'Login com Google realizado com sucesso',
      user: userPayload
    });
  } catch (error: any) {
    console.error('[Google Auth Error]', error);
    if (error.message === 'INVALID_GOOGLE_TOKEN') {
      return reply.status(401).send({ error: 'Autenticação do Google falhou.' });
    }
    return reply.status(500).send({ error: 'Erro interno no servidor ao autenticar com Google.' });
  }
}
