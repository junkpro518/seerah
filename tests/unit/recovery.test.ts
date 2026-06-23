import { describe, it, expect } from "vitest";
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyRecoveryCode,
  normalizeRecoveryCode,
} from "@/lib/auth/recovery";

/**
 * وحدة: الرموز الاحتياطية لـ 2FA (FR-005).
 * تُولَّد، تُعرض مرة، وتُخزَّن **مجزّأة** (scrypt مملّح) في app_metadata.
 * أحادية الاستخدام: بعد استهلاك رمز يُزال hashه فلا يصلح ثانية.
 * صفر تغيير مخطط (بيانات في عمود metadata قائم).
 */
describe("recovery codes (FR-005)", () => {
  it("generates the requested count of distinct codes", () => {
    const codes = generateRecoveryCodes(10);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c.length).toBeGreaterThanOrEqual(8);
  });

  it("hashes are salted: same code → different hash each time, all parse as scrypt", () => {
    const h1 = hashRecoveryCode("ABCDE-FGHIJ");
    const h2 = hashRecoveryCode("ABCDE-FGHIJ");
    expect(h1).not.toBe(h2);
    expect(h1.startsWith("scrypt$")).toBe(true);
    expect(h1.split("$")).toHaveLength(3);
  });

  it("verifies a correct code and returns its index; wrong code → -1", () => {
    const codes = generateRecoveryCodes(5);
    const hashes = codes.map(hashRecoveryCode);
    expect(verifyRecoveryCode(codes[2], hashes)).toBe(2);
    expect(verifyRecoveryCode("not-a-real-code", hashes)).toBe(-1);
  });

  it("is single-use: after removing the matched hash, the same code no longer verifies", () => {
    const codes = generateRecoveryCodes(3);
    let hashes = codes.map(hashRecoveryCode);
    const idx = verifyRecoveryCode(codes[1], hashes);
    expect(idx).toBe(1);
    hashes = hashes.filter((_, i) => i !== idx); // استهلاك
    expect(verifyRecoveryCode(codes[1], hashes)).toBe(-1);
  });

  it("normalizes formatting (case, spaces, hyphens) so display form still verifies", () => {
    const hash = hashRecoveryCode("abcdefghij");
    expect(verifyRecoveryCode("ABCD-EFGH IJ", [hash])).toBe(0);
    expect(normalizeRecoveryCode("AB cd-EF")).toBe("abcdef");
  });
});
