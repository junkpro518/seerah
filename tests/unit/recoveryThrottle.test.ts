import { describe, it, expect } from "vitest";
import {
  initialRecoveryThrottle,
  evaluateRecoveryThrottle,
  registerRecoveryFailure,
  resetRecoveryThrottle,
  MAX_RECOVERY_FAILS,
  RECOVERY_WINDOW_MS,
  RECOVERY_LOCKOUT_MS,
} from "@/lib/auth/recoveryThrottle";

/**
 * وحدة: قفل محاولات الاستعادة (تحصين — المسار يُلغي 2FA فهو أوراكل تخمين).
 * منطق نقيّ بزمن محقون. الحالة تُخزَّن في app_metadata بجوار الرموز (لا تغيير مخطط).
 */
describe("recovery attempt throttle", () => {
  const t0 = 1_000_000;

  it("starts unlocked", () => {
    expect(evaluateRecoveryThrottle(initialRecoveryThrottle, t0).locked).toBe(false);
  });

  it("locks after MAX failures within the window", () => {
    let s = initialRecoveryThrottle;
    for (let i = 0; i < MAX_RECOVERY_FAILS - 1; i++) {
      s = registerRecoveryFailure(s, t0 + i * 1000);
      expect(evaluateRecoveryThrottle(s, t0 + i * 1000).locked).toBe(false);
    }
    // الفشل رقم MAX يقفل
    s = registerRecoveryFailure(s, t0 + 5000);
    const ev = evaluateRecoveryThrottle(s, t0 + 5000);
    expect(ev.locked).toBe(true);
    expect(ev.retryAfterMs).toBeGreaterThan(0);
  });

  it("stays locked until lockout elapses, then unlocks", () => {
    let s = initialRecoveryThrottle;
    for (let i = 0; i < MAX_RECOVERY_FAILS; i++) s = registerRecoveryFailure(s, t0 + i * 1000);
    const lockedAt = t0 + (MAX_RECOVERY_FAILS - 1) * 1000;
    expect(evaluateRecoveryThrottle(s, lockedAt + RECOVERY_LOCKOUT_MS - 1).locked).toBe(true);
    expect(evaluateRecoveryThrottle(s, lockedAt + RECOVERY_LOCKOUT_MS + 1).locked).toBe(false);
  });

  it("counting resets when failures fall outside the window", () => {
    let s = initialRecoveryThrottle;
    s = registerRecoveryFailure(s, t0); // fail 1
    // فشل لاحق بعد انقضاء النافذة → يبدأ عدّ جديد، لا يقفل
    s = registerRecoveryFailure(s, t0 + RECOVERY_WINDOW_MS + 1);
    expect(evaluateRecoveryThrottle(s, t0 + RECOVERY_WINDOW_MS + 1).locked).toBe(false);
  });

  it("reset clears the state (used on successful recovery)", () => {
    let s = initialRecoveryThrottle;
    for (let i = 0; i < MAX_RECOVERY_FAILS; i++) s = registerRecoveryFailure(s, t0 + i * 1000);
    expect(evaluateRecoveryThrottle(s, t0 + 5000).locked).toBe(true);
    const cleared = resetRecoveryThrottle();
    expect(evaluateRecoveryThrottle(cleared, t0 + 5000).locked).toBe(false);
  });
});
