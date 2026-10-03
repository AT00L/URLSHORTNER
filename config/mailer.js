import { Resend } from "resend";
import { OTP_TTL_MINUTES } from "../utils/otp.js";

const APP_NAME = "URLShorty";

let client = null;

function resend() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not set");
  }
  client ??= new Resend(process.env.RESEND_API_KEY);
  return client;
}

export function buildOtpEmail({ name, code }) {
  const subject = `${code} is your OTP to validate your email — ${APP_NAME}`;
  const heading = "Validate your email";
  const lead = `use the one-time password below to validate your email address and finish creating your ${APP_NAME} account.`;

  const html = `<div style="background:#f6f7f9;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:460px;margin:0 auto;background:#ffffff;border:1px solid #e3e6ea;border-radius:12px;overflow:hidden">
    <div style="padding:18px 28px;border-bottom:1px solid #e3e6ea">
      <span style="font-size:15px;font-weight:700;color:#2f6fed;letter-spacing:-.01em">${APP_NAME}</span>
    </div>

    <div style="padding:28px">
      <h1 style="margin:0 0 10px;font-size:20px;color:#16181d">${heading}</h1>
      <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#6b7280">
        Hi ${name}, ${lead}
      </p>

      <div style="background:#f6f7f9;border:1px solid #e3e6ea;border-radius:10px;padding:18px;text-align:center;margin-bottom:22px">
        <div style="font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:#6b7280;margin-bottom:8px">One-time password</div>
        <div style="font-size:34px;font-weight:700;letter-spacing:10px;color:#16181d">${code}</div>
      </div>

      <p style="margin:0 0 6px;font-size:13px;color:#6b7280">
        This OTP expires in <strong style="color:#16181d">${OTP_TTL_MINUTES} minutes</strong> and can be used once.
      </p>
      <p style="margin:0;font-size:13px;color:#6b7280">
        Didn't request it? You can safely ignore this email — nobody can access your account without this code.
      </p>
    </div>

    <div style="padding:14px 28px;border-top:1px solid #e3e6ea;background:#fafbfc">
      <p style="margin:0;font-size:12px;color:#9aa1ad">Sent automatically by ${APP_NAME}. Please don't reply.</p>
    </div>
  </div>
</div>`;

  const text = `${heading}

Hi ${name}, ${lead}

One-time password: ${code}

This OTP expires in ${OTP_TTL_MINUTES} minutes and can be used once.
Didn't request it? You can safely ignore this email.

— ${APP_NAME}`;

  return { subject, html, text };
}

export async function sendOtpEmail({ to, name, code }) {
  const { subject, html, text } = buildOtpEmail({ name, code });

  // The Resend SDK resolves with { data, error } instead of rejecting, so an
  // API-level failure has to be turned into a throw explicitly.
  const { data, error } = await resend().emails.send({
    from: process.env.MAIL_FROM,
    to,
    subject,
    html,
    text,
  });

  if (error) {
    throw new Error(error.message || "Email could not be sent");
  }

  return data;
}
