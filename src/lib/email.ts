const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type Mail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export function fromAddress(): string {
  return process.env.RESEND_FROM || "SidFast <onboarding@resend.dev>";
}

/**
 * Sends through Resend. Returns false when email is not configured, so callers
 * can fall back (e.g. logging the link) instead of failing the request.
 */
export async function sendMail(mail: Mail): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        html: mail.html || shell(mail.subject, mail.text),
        reply_to: process.env.APP_URL || undefined,
      }),
    });
    if (!res.ok) {
      console.error("email failed", res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("email failed", e);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Templates                                                          */
/* ------------------------------------------------------------------ */

const ACCENT = "#0a84ff";

export function shell(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;padding:32px;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0a0a0a">
  <div style="max-width:520px;margin:0 auto">
    <div style="display:flex;align-items:center;gap:8px;font-size:15px;font-weight:600">
      <span style="display:inline-flex;width:22px;height:22px;align-items:center;justify-content:center;border-radius:4px;background:#0a0a0a;color:#fff;font-size:11px;font-weight:700">S</span>
      SidFast
    </div>
    <h1 style="font-size:20px;font-weight:600;margin:28px 0 12px">${title}</h1>
    <div style="font-size:15px;line-height:1.6;color:#3f3f46">${bodyHtml}</div>
    <p style="font-size:13px;color:#71717a;margin-top:32px">Sent by SidFast · self-hosted analytics</p>
  </div>
</body></html>`;
}

export function button(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${href}" style="display:inline-block;background:${ACCENT};color:#fff;text-decoration:none;padding:11px 22px;border-radius:999px;font-size:14px;font-weight:500">${label}</a></p>
  <p style="font-size:13px;color:#71717a">Or paste this link:<br><a href="${href}" style="color:${ACCENT};word-break:break-all">${href}</a></p>`;
}

export async function sendWelcome(to: string, name: string): Promise<boolean> {
  const greet = name ? `Hi ${name},` : "Hi,";
  return sendMail({
    to,
    subject: "Your SidFast account is ready",
    text: `${greet}\n\nYour account is live. Add a website from the dashboard and paste the tracking snippet to start seeing visits and revenue.\n\n${
      process.env.APP_URL || ""
    }/dashboard\n\n— SidFast`,
    html: shell(
      "Your account is ready",
      `<p>${greet}</p><p>Your account is live. Add a website from the dashboard and paste the tracking snippet to start seeing visits and revenue.</p>${button(
        `${process.env.APP_URL || ""}/dashboard`,
        "Open dashboard",
      )}`,
    ),
  });
}

export async function sendPasswordReset(
  to: string,
  resetUrl: string,
): Promise<boolean> {
  return sendMail({
    to,
    subject: "Reset your SidFast password",
    text: `Someone asked to reset the password for this SidFast account.\n\nOpen this link within 60 minutes to choose a new one:\n${resetUrl}\n\nIf this wasn't you, ignore this email.`,
    html: shell(
      "Reset your password",
      `<p>Someone asked to reset the password for this SidFast account.</p>${button(
        resetUrl,
        "Choose a new password",
      )}<p style="font-size:13px;color:#71717a">The link expires in 60 minutes. If this wasn't you, just ignore this email.</p>`,
    ),
  });
}
