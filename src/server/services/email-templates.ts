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
  const ignore = 'Se você não iniciou um cadastro no Kindra, ignore este e-mail.';
  return {
    to, subject: 'Confirme seu e-mail no Kindra',
    html: layout('Confirme seu e-mail', 'Alguém iniciou um cadastro no Kindra com este endereço. Use o código abaixo depois de abrir o link de confirmação.',
      codeBlock(code, duration, ignore), { label: 'Continuar cadastro', url: link }),
    text: `Kindra\n\nConfirme seu e-mail\nAlguém iniciou um cadastro no Kindra com este endereço.\n\nCódigo: ${code}\nContinuar cadastro: ${link}\n\n${duration}\n${ignore}`,
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
