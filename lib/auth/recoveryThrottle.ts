/**
 * قفل محاولات استعادة 2FA (تحصين) — منطق نقيّ بزمن محقون.
 *
 * المسار `recoverWithCode` يُلغي 2FA عند رمز صحيح، فهو أوراكل تخمين. نحدّ المحاولات:
 * بعد MAX فشل ضمن نافذة، نقفل الاستعادة مؤقتًا. الحالة تُخزَّن في
 * `app_metadata.mfa_recovery_throttle` بجوار الرموز (لا تغيير مخطط)، وتُصفَّر عند النجاح.
 */
export const MAX_RECOVERY_FAILS = 5;
export const RECOVERY_WINDOW_MS = 15 * 60 * 1000; // 15 دقيقة
export const RECOVERY_LOCKOUT_MS = 15 * 60 * 1000; // 15 دقيقة

export type RecoveryThrottle = {
  fails: number;
  firstFailAt: number | null;
  lockedUntil: number | null;
};

export const initialRecoveryThrottle: RecoveryThrottle = {
  fails: 0,
  firstFailAt: null,
  lockedUntil: null,
};

export function evaluateRecoveryThrottle(
  state: RecoveryThrottle,
  now: number,
): { locked: boolean; retryAfterMs: number } {
  if (state.lockedUntil != null && now < state.lockedUntil) {
    return { locked: true, retryAfterMs: state.lockedUntil - now };
  }
  return { locked: false, retryAfterMs: 0 };
}

export function registerRecoveryFailure(
  state: RecoveryThrottle,
  now: number,
): RecoveryThrottle {
  let fails: number;
  let firstFailAt: number;

  // نافذة منزلقة: فشل خارج النافذة (أو أول فشل) يبدأ عدًّا جديدًا
  if (state.firstFailAt == null || now - state.firstFailAt > RECOVERY_WINDOW_MS) {
    firstFailAt = now;
    fails = 1;
  } else {
    firstFailAt = state.firstFailAt;
    fails = state.fails + 1;
  }

  const lockedUntil = fails >= MAX_RECOVERY_FAILS ? now + RECOVERY_LOCKOUT_MS : null;
  return { fails, firstFailAt, lockedUntil };
}

export function resetRecoveryThrottle(): RecoveryThrottle {
  return { ...initialRecoveryThrottle };
}
