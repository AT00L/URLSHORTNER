import crypto from "crypto";

export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;

// 6 digits, uniformly random — Math.random() is not suitable for auth codes
export function generateOtp() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashOtp(code) {
  return crypto.createHash("sha256").update(String(code)).digest("hex");
}

export function otpExpiry() {
  return new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
}

// constant-time compare so a wrong code cannot be probed by timing
export function otpMatches(code, hash) {
  if (!hash) return false;
  const a = Buffer.from(hashOtp(code));
  const b = Buffer.from(hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
