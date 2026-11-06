import { adminUrl, env } from '../config.js';
export async function sendPasswordResetEmail(to, token) {
    if (!env.SMTP_HOST)
        return false;
    const { createTransport } = await import('nodemailer');
    const transport = createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? '' } : undefined,
    });
    const link = `${adminUrl}/login?token=${encodeURIComponent(token)}`;
    await transport.sendMail({
        from: env.SMTP_FROM || env.SMTP_USER || 'noreply@kwanzanews.ao',
        to,
        subject: 'Recuperação de palavra-passe — Kwanza News',
        text: `Para definir uma nova palavra-passe, abra esta ligação nos próximos 30 minutos:\n${link}\n\nSe não pediu esta recuperação, ignore esta mensagem.`,
    });
    return true;
}
