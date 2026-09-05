import crypto from 'crypto';
import fetch from 'node-fetch'; // O Node v18+ possui fetch nativo, mas podemos usar o global
import prisma from '../db.js';

/**
 * Gera um token seguro, salva o hash no banco e envia o token em texto puro via e-mail.
 */
export async function sendVerificationEmail(userId: string, email: string) {
  // 1. Gera token numérico de 6 dígitos
  const token = crypto.randomInt(100000, 999999).toString();
  
  // 2. Cria o Hash
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  
  // 3. Salva no banco (validade 20 min)
  const expiresAt = new Date(Date.now() + 20 * 60 * 1000);
  
  // Se já existir um token para o usuário, podemos deletar antes de criar outro
  await prisma.emailVerificationToken.deleteMany({
    where: { userId }
  });

  await prisma.emailVerificationToken.create({
    data: {
      token: hashedToken,
      userId,
      expiresAt,
    }
  });

  // 4. Envia via Brevo
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error('A chave de API do Brevo não está configurada no servidor.');
  }

  const htmlTemplate = `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7f7f9; padding: 40px 20px; text-align: center;">
    <div style="max-w-md: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; padding: 40px 30px; box-shadow: 0 4px 24px rgba(0,0,0,0.04);">
      <h1 style="color: #09090b; font-size: 24px; font-weight: 700; margin-top: 0; margin-bottom: 12px; letter-spacing: -0.02em;">
        Verifique seu E-mail
      </h1>
      <p style="color: #71717a; font-size: 16px; line-height: 1.5; margin-bottom: 32px;">
        Use o código de segurança abaixo para ativar sua conta no Kindra.
      </p>
      
      <div style="background-color: #f4f4f5; border-radius: 12px; padding: 24px; margin-bottom: 32px; letter-spacing: 0.25em;">
        <span style="font-size: 36px; font-weight: 800; color: #09090b;">
          ${token}
        </span>
      </div>
      
      <p style="color: #a1a1aa; font-size: 14px; margin-bottom: 0;">
        Este código é válido por 20 minutos.<br/>Se você não solicitou este e-mail, pode ignorá-lo com segurança.
      </p>
    </div>
  </div>
  `;

  const response = await globalThis.fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      sender: { email: process.env.BREVO_SENDER_EMAIL || 'kindra.app01@gmail.com', name: 'Kindra App' },
      to: [{ email }],
      subject: 'Seu código de verificação - Kindra',
      htmlContent: htmlTemplate
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Falha ao enviar e-mail via Brevo', errorText);
    throw new Error(`Erro do provedor de e-mail: ${errorText}`);
  }
}

export async function sendPasswordResetEmail(userId: string, email: string) {
  // 1. Gera token numérico de 6 dígitos
  const token = crypto.randomInt(100000, 999999).toString();
  
  // 2. Cria o Hash
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  
  // 3. Salva no banco (validade 10 min)
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  
  // Se já existir um token para o usuário, podemos deletar antes de criar outro
  await prisma.passwordResetToken.deleteMany({
    where: { userId }
  });

  await prisma.passwordResetToken.create({
    data: {
      token: hashedToken,
      userId,
      expiresAt,
    }
  });

  // 4. Envia via Brevo
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error('A chave de API do Brevo não está configurada no servidor.');
  }

  const htmlTemplate = `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7f7f9; padding: 40px 20px; text-align: center;">
    <div style="max-w-md: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; padding: 40px 30px; box-shadow: 0 4px 24px rgba(0,0,0,0.04);">
      <h1 style="color: #09090b; font-size: 24px; font-weight: 700; margin-top: 0; margin-bottom: 12px; letter-spacing: -0.02em;">
        Redefinição de Senha
      </h1>
      <p style="color: #71717a; font-size: 16px; line-height: 1.5; margin-bottom: 32px;">
        Recebemos um pedido para redefinir sua senha no Kindra. Use o código de segurança abaixo para prosseguir.
      </p>
      
      <div style="background-color: #f4f4f5; border-radius: 12px; padding: 24px; margin-bottom: 32px; letter-spacing: 0.25em;">
        <span style="font-size: 36px; font-weight: 800; color: #09090b;">
          ${token}
        </span>
      </div>
      
      <p style="color: #a1a1aa; font-size: 14px; margin-bottom: 0;">
        Este código é válido por 10 minutos.<br/>Se você não solicitou a redefinição de senha, você pode ignorar este e-mail com segurança.
      </p>
    </div>
  </div>
  `;

  const response = await globalThis.fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      sender: { email: process.env.BREVO_SENDER_EMAIL || 'kindra.app01@gmail.com', name: 'Kindra App' },
      to: [{ email }],
      subject: 'Código de redefinição de senha - Kindra',
      htmlContent: htmlTemplate
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Falha ao enviar e-mail de redefinição via Brevo', errorText);
    throw new Error(`Erro do provedor de e-mail: ${errorText}`);
  }
}

export async function sendRegistrationAttemptEmail(email: string) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return;
  
  const htmlTemplate = `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7f7f9; padding: 40px 20px; text-align: center;">
    <div style="max-w-md: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; padding: 40px 30px; box-shadow: 0 4px 24px rgba(0,0,0,0.04);">
      <h1 style="color: #09090b; font-size: 24px; font-weight: 700; margin-top: 0; margin-bottom: 12px; letter-spacing: -0.02em;">
        Tentativa de Cadastro
      </h1>
      <p style="color: #71717a; font-size: 16px; line-height: 1.5; margin-bottom: 32px;">
        Alguém acabou de tentar criar uma conta no Kindra usando este endereço de e-mail, mas você já possui uma conta ativa.
      </p>
      <p style="color: #71717a; font-size: 16px; line-height: 1.5; margin-bottom: 32px;">
        Se foi você, não é necessário criar uma nova conta. Faça login com suas credenciais ou utilize a opção "Esqueci minha senha" se não conseguir acessar.
      </p>
      <p style="color: #a1a1aa; font-size: 14px; margin-bottom: 0;">
        Se você não fez essa tentativa, pode ignorar este e-mail com segurança.
      </p>
    </div>
  </div>
  `;
  
  try {
    await globalThis.fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: { email: process.env.BREVO_SENDER_EMAIL || 'kindra.app01@gmail.com', name: 'Kindra App' },
        to: [{ email }],
        subject: 'Tentativa de cadastro com seu e-mail - Kindra',
        htmlContent: htmlTemplate
      })
    });
  } catch (err) {
    console.error('Falha ao enviar e-mail de tentativa de cadastro', err);
  }
}

export async function sendPasswordChangedNotification(email: string) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return;

  const htmlTemplate = `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7f7f9; padding: 40px 20px; text-align: center;">
    <div style="max-w-md: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; padding: 40px 30px; box-shadow: 0 4px 24px rgba(0,0,0,0.04);">
      <h1 style="color: #09090b; font-size: 24px; font-weight: 700; margin-top: 0; margin-bottom: 12px; letter-spacing: -0.02em;">
        Senha Alterada com Sucesso
      </h1>
      <p style="color: #71717a; font-size: 16px; line-height: 1.5; margin-bottom: 32px;">
        Informamos que a senha da sua conta no Kindra foi alterada recentemente.
      </p>
      <p style="color: #a1a1aa; font-size: 14px; margin-bottom: 0;">
        Se você não fez essa alteração, por favor, entre em contato com nosso suporte imediatamente.
      </p>
    </div>
  </div>
  `;

  try {
    await globalThis.fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: { email: process.env.BREVO_SENDER_EMAIL || 'kindra.app01@gmail.com', name: 'Kindra App' },
        to: [{ email }],
        subject: 'Sua senha foi alterada - Kindra',
        htmlContent: htmlTemplate
      })
    });
  } catch (err) {
    console.error('Falha ao enviar notificação de senha alterada', err);
  }
}

