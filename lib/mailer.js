import nodemailer from 'nodemailer';

// Kênh gửi mã xác minh: Gmail SMTP với App Password (0đ). Credential chỉ đọc
// từ env (Vercel hoặc .env local), không hardcode. Thiếu cấu hình → trả null
// để endpoint báo 503 cho người dùng biết chưa gửi được mail.
function getSmtpConfig() {
  const user = String(process.env.SMTP_USER || process.env.GMAIL_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || '').trim();
  if (!user || !pass) return null;
  return { user, pass };
}

export function isMailerConfigured() {
  return Boolean(getSmtpConfig());
}

function createTransport() {
  const config = getSmtpConfig();
  if (!config) {
    throw Object.assign(new Error('mail-not-configured'), { status: 503 });
  }
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: config.user, pass: config.pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000
  });
}

/**
 * Gửi mã OTP 6 số tới email đăng ký. Không bao giờ log mã ra console.
 * @param {{ to: string, code: string, name?: string }} opts
 */
export async function sendOtpEmail({ to, code, name }) {
  const config = getSmtpConfig();
  if (!config) {
    throw Object.assign(new Error('mail-not-configured'), { status: 503 });
  }
  const transport = createTransport();
  const from = process.env.SMTP_FROM || `"FTECA 24" <${config.user}>`;
  const displayName = String(name || '').trim() || 'bạn';
  const subject = `${code} là mã xác minh FTECA 24 của bạn`;
  const text = [
    `Xin chào ${displayName},`,
    '',
    `Mã xác minh tài khoản FTECA 24 của bạn là: ${code}`,
    'Mã có hiệu lực trong 10 phút. Không chia sẻ mã này cho bất kỳ ai.',
    'Nếu bạn không yêu cầu mã này, hãy bỏ qua email.',
    '',
    '— FTECA 24'
  ].join('\n');
  const html = `
  <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
    <div style="font-size:20px;font-weight:800;color:#00b96b;margin-bottom:16px">FTECA 24</div>
    <p>Xin chào <strong>${escapeHtml(displayName)}</strong>,</p>
    <p>Mã xác minh tài khoản của bạn là:</p>
    <div style="font-size:34px;font-weight:800;letter-spacing:8px;color:#00b96b;background:#edfaf3;border-radius:12px;padding:18px;text-align:center;margin:16px 0">${code}</div>
    <p style="color:#555;font-size:14px">Mã có hiệu lực trong <strong>10 phút</strong>. Không chia sẻ mã này cho bất kỳ ai.</p>
    <p style="color:#999;font-size:13px">Nếu bạn không yêu cầu mã này, hãy bỏ qua email.</p>
    <p style="color:#999;font-size:13px;margin-top:24px">— FTECA 24</p>
  </div>`;

  await transport.sendMail({ from, to, subject, text, html });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}