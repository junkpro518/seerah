import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * الرموز الاحتياطية لـ 2FA (FR-005) — وحدة نقيّة، خادمية.
 *
 * Supabase لا يوفّر رموزًا احتياطية لـ TOTP، فنولّدها ونعرضها مرة ونخزّن **hashes**
 * (scrypt مملّح) في `auth.users.app_metadata.mfa_recovery` عبر admin API (خادم).
 * **بيانات في عمود metadata قائم — لا DDL، فـ SC-009 سليم.**
 *
 * أحادية الاستخدام: المتصل (server action) يزيل الـ hash المطابق بعد القبول.
 */

const HASH_KEYLEN = 32;
const SALT_BYTES = 16;
const CODE_BYTES = 5; // 10 hex chars لكل رمز

export function normalizeRecoveryCode(code: string): string {
  return code.replace(/[\s-]/g, "").toLowerCase();
}

export function generateRecoveryCodes(count = 10): string[] {
  const codes = new Set<string>();
  while (codes.size < count) {
    const raw = randomBytes(CODE_BYTES).toString("hex"); // 10 hex
    // عرض مقسّم لسهولة القراءة: abcde-fghij (التطبيع يزيل الشرطة)
    codes.add(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return [...codes];
}

export function hashRecoveryCode(code: string): string {
  const salt = randomBytes(SALT_BYTES);
  const hash = scryptSync(normalizeRecoveryCode(code), salt, HASH_KEYLEN);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/**
 * يعيد فهرس الـ hash المطابق أو -1. مقارنة ثابتة الزمن (timingSafeEqual).
 * المتصل مسؤول عن: (أ) أخذ userId من الجلسة لا من العميل، (ب) خنق المحاولات،
 * (ج) إزالة الفهرس المطابق (أحادية الاستخدام).
 */
export function verifyRecoveryCode(code: string, hashes: string[]): number {
  const norm = normalizeRecoveryCode(code);
  for (let i = 0; i < hashes.length; i++) {
    const parts = hashes[i].split("$");
    if (parts.length !== 3 || parts[0] !== "scrypt") continue;
    const salt = Buffer.from(parts[1], "hex");
    const expected = Buffer.from(parts[2], "hex");
    const computed = scryptSync(norm, salt, expected.length);
    if (computed.length === expected.length && timingSafeEqual(computed, expected)) {
      return i;
    }
  }
  return -1;
}
