import { FastifyInstance } from 'fastify';
import { 
  loginController, 
  resendVerificationController, 
  confirmVerificationController, 
  meController, 
  forgotPasswordController, 
  verifyResetCodeController, 
  resetPasswordController,
  changeUnverifiedEmailController,
  googleAuthController,
  logoutController
} from '../controllers/auth.controller.js';
import { requireScope } from '../middlewares/auth.js';

export async function authRoutes(fastify: FastifyInstance) {
  // Login Google
  fastify.post('/google', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute'
      }
    }
  }, googleAuthController);

  // Rota de login (5 tentativas por minuto)
  fastify.post('/login', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute'
      }
    }
  }, loginController);

  // Logout revoga o JWT apresentado e limpa o cookie com as flags originais.
  fastify.post('/logout', logoutController);

  // Me - Retorna o usuário logado
  fastify.get('/me', {
    preHandler: requireScope()
  }, meController);

  // Rota para reenviar o e-mail (3 requests a cada 15 min)
  fastify.post('/verify-email/send', {
    config: {
      rateLimit: {
        max: 3,
        timeWindow: '15 minute'
      }
    }
  }, resendVerificationController);

  // Rota para validar o token
  fastify.post('/verify-email/confirm', {
    preHandler: requireScope('pending_verification'),
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute'
      }
    }
  }, confirmVerificationController);

  // Trocar email nao verificado
  fastify.post('/verify-email/change', {
    preHandler: requireScope('pending_verification'),
    config: {
      rateLimit: {
        max: 3,
        timeWindow: '15 minute'
      }
    }
  }, changeUnverifiedEmailController);

  // Fluxo de esqueci a senha
  fastify.post('/forgot-password', {
    config: {
      rateLimit: {
        max: 3,
        timeWindow: '15 minute'
      }
    }
  }, forgotPasswordController);

  fastify.post('/verify-reset-code', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute'
      }
    }
  }, verifyResetCodeController);

  fastify.post('/reset-password', {
    preHandler: requireScope('reset_password'),
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute'
      }
    }
  }, resetPasswordController);
}
