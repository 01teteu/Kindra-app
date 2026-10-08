import type { TransactionalEmail } from './transactional-email.provider.js';

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

function layout(title: string, intro: string, content: string, action?: { label: string; url: string }) {
  const button = action ? `<tr><td align="center" style="padding:26px 0 0">
    <a href="${escapeHtml(action.url)}" style="display:inline-block;background:#35c8bb;color:#102522;text-decoration:none;font-size:15px;font-weight:700;padding:14px 24px;border-radius:10px">${escapeHtml(action.label)}</a>
  </td></tr>` : '';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#eef2f1;color:#182522;font-family:Arial,Helvetica,sans-serif">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#eef2f1"><tr><td align="center" style="padding:28px 14px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #dfe8e5;border-radius:16px">
        <tr><td style="padding:30px 30px 0;color:#102522;font-size:26px;font-weight:800;letter-spacing:-1px">kindra<span style="color:#168b80">.</span></td></tr>
        <tr><td style="padding:27px 30px 30px">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr><td style="font-size:23px;line-height:1.25;font-weight:700;color:#102522;padding-bottom:12px">${escapeHtml(title)}</td></tr>
            <tr><td style="font-size:15px;line-height:1.65;color:#465650">${escapeHtml(intro)}</td></tr>
            ${content}${button}
          </table>
        </td></tr>
      </table>
      <p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:#64736d">Kindra · kindrafit.com</p>
    </td></tr></table>
  </body></html>`;
}

function codeBlock(code: string, duration: string, ignore: string) {
  return `<tr><td align="center" style="padding:26px 0 4px">
    <div style="display:inline-block;padding:16px 22px;background:#edf7f5;border:1px solid #c7e9e3;border-radius:10px;color:#102522;font-size:30px;font-weight:800;letter-spacing:7px">${escapeHtml(code)}</div>
  </td></tr><tr><td style="padding-top:24px;font-size:13px;line-height:1.6;color:#64736d">${escapeHtml(duration)}<br>${escapeHtml(ignore)}</td></tr>`;
}

export function verificationEmail(to: string, code: string, link: string): TransactionalEmail {
  const duration = 'O código e o link são válidos por 20 minutos.';
  const ignore = 'Se você não solicitou este cadastro, pode ignorar este e-mail.';
  const preheader = 'Confirme seu e-mail para continuar seu cadastro.';
  return {
    to, subject: 'Seu código Kindra chegou',
    html: `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
    <body style="margin:0;padding:0;background-color:#0c0e0e;color:#fafafa;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
      <div style="display:none!important;visibility:hidden;mso-hide:all;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${escapeHtml(preheader)}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0c0e0e" style="width:100%;background-color:#0c0e0e"><tr><td align="center" style="padding:24px 12px">
        <!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#151818" style="width:100%;max-width:560px;background-color:#151818;border:1px solid #262c2b;border-radius:16px">
          <tr><td align="center" style="padding:30px 24px 0;font-size:25px;line-height:1.2;font-weight:800;letter-spacing:-1px;color:#fafafa">kindra<span style="color:#2dd4bf">.</span></td></tr>
          <tr><td align="center" style="padding:36px 24px 0;font-size:31px;line-height:1.16;font-weight:700;letter-spacing:-1px;color:#fafafa">Seu código chegou.</td></tr>
          <tr><td align="center" style="padding:13px 24px 0;font-size:15px;line-height:1.6;color:#a0aaa7">Só precisamos confirmar que este e-mail é seu.</td></tr>
          <tr><td align="center" style="padding:33px 24px 0;font-size:11px;line-height:1.5;font-weight:700;letter-spacing:1.5px;color:#a0aaa7">CÓDIGO DE VERIFICAÇÃO</td></tr>
          <tr><td align="center" style="padding:12px 20px 0">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#0c0e0e" style="padding:17px 22px;background-color:#0c0e0e;border:1px solid #37403e;border-radius:12px;font-size:38px;line-height:1.2;font-weight:700;letter-spacing:0.16em;color:#2dd4bf;white-space:nowrap"><span>${escapeHtml(code)}</span></td></tr></table>
          </td></tr>
          <tr><td align="center" style="padding:19px 24px 0;font-size:14px;line-height:1.6;color:#a0aaa7">Use este código para continuar seu cadastro no Kindra.</td></tr>
          <tr><td align="center" style="padding:29px 24px 0">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#2dd4bf" style="background-color:#2dd4bf;border-radius:10px"><a href="${escapeHtml(link)}" style="display:block;padding:16px 27px;color:#0c0e0e;text-decoration:none;font-size:15px;line-height:1.2;font-weight:700">Continuar no Kindra</a></td></tr></table>
          </td></tr>
          <tr><td align="center" style="padding:18px 24px 35px;font-size:13px;line-height:1.6;color:#a0aaa7">${escapeHtml(duration)}</td></tr>
          <tr><td style="border-top:1px solid #262c2b;padding:22px 24px 27px;font-size:12px;line-height:1.6;color:#a0aaa7">${escapeHtml(ignore)}</td></tr>
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
        <p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:#a0aaa7">Kindra · kindrafit.com</p>
      </td></tr></table>
    </body></html>`,
    text: `Kindra\n\nSeu código chegou.\nSó precisamos confirmar que este e-mail é seu.\n\nCódigo: ${code}\nUse este código para continuar seu cadastro no Kindra.\n\nContinuar no Kindra: ${link}\n\n${duration}\n${ignore}`,
  };
}

export function passwordResetEmail(to: string, code: string, appUrl: string): TransactionalEmail {
  const duration = 'Este código é válido por 10 minutos.';
  const ignore = 'Se você não solicitou a recuperação de senha, ignore este e-mail.';
  const link = `${appUrl}/forgot-password`;
  return {
    to, subject: 'Recupere sua senha no Kindra',
    html: layout('Recuperar senha', 'Recebemos uma solicitação para redefinir sua senha. Informe o código abaixo na tela de recuperação.',
      codeBlock(code, duration, ignore), { label: 'Abrir recuperação', url: link }),
    text: `Kindra\n\nRecuperar senha\nRecebemos uma solicitação para redefinir sua senha.\n\nCódigo: ${code}\nAbrir recuperação: ${link}\n\n${duration}\n${ignore}`,
  };
}

export function registrationAttemptEmail(to: string, appUrl: string): TransactionalEmail {
  const link = `${appUrl}/login`;
  return {
    to, subject: 'Tentativa de cadastro no Kindra',
    html: layout('Tentativa de cadastro', 'Recebemos uma tentativa de cadastro com este endereço. Se você já tem uma conta, pode entrar normalmente. Se não fez essa tentativa, ignore esta mensagem.', '',
      { label: 'Entrar no Kindra', url: link }),
    text: `Kindra\n\nRecebemos uma tentativa de cadastro com este endereço. Se você já tem uma conta, pode entrar normalmente: ${link}\nSe não fez essa tentativa, ignore esta mensagem.`,
  };
}

export function passwordChangedEmail(to: string, appUrl: string): TransactionalEmail {
  const link = `${appUrl}/forgot-password`;
  return {
    to, subject: 'Sua senha do Kindra foi alterada',
    html: layout('Senha alterada', 'A senha da sua conta Kindra foi alterada. Se você não reconhece essa ação, inicie a recuperação de senha.', '',
      { label: 'Recuperar acesso', url: link }),
    text: `Kindra\n\nA senha da sua conta foi alterada. Se você não reconhece essa ação, inicie a recuperação de senha: ${link}`,
  };
}
