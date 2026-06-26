"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { setupRecoveryCodes } from "@/lib/auth/actions";

type Mode = "loading" | "enroll" | "challenge" | "recoveryCodes" | "done";

export default function MfaPage() {
  const [mode, setMode] = useState<Mode>("loading");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === "aal2") return setMode("done");

      const { data: f } = await supabase.auth.mfa.listFactors();
      const verified = f?.totp ?? [];
      if (verified.length > 0) {
        setFactorId(verified[0].id);
        return setMode("challenge");
      }

      const { data: e, error: enrollErr } = await supabase.auth.mfa.enroll({
        factorType: "totp",
      });
      if (enrollErr || !e) return setError("تعذّر بدء تسجيل 2FA.");
      setFactorId(e.id);
      setSecret(e.totp.secret);
      setMode("enroll");
    })();
  }, []);

  async function submitCode() {
    if (!factorId) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
    if (chErr || !ch) {
      setBusy(false);
      return setError("تعذّر إنشاء التحدّي.");
    }
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: ch.id,
      code,
    });
    if (vErr) {
      setBusy(false);
      return setError("رمز غير صحيح.");
    }

    // بلغنا aal2. عند التسجيل الأول/إعادة التسجيل: ولّد الرموز الاحتياطية واعرضها مرة.
    if (mode === "enroll") {
      const res = await setupRecoveryCodes();
      if ("codes" in res) {
        setCodes(res.codes);
        setBusy(false);
        return setMode("recoveryCodes");
      }
      // فشل توليد الرموز (ميزة أمنية) — لا تتابع بصمت؛ اعرض الخطأ وأتح إعادة المحاولة
      setBusy(false);
      return setError(res.error);
    }
    window.location.href = "/claims";
  }

  if (mode === "loading") return <Center>جارٍ التحميل…</Center>;
  if (mode === "done")
    return (
      <Center>
        <p className="mb-4">تم التحقّق بخطوتين (aal2).</p>
        <a href="/claims" className="underline">المتابعة</a>
      </Center>
    );

  if (mode === "recoveryCodes")
    return (
      <Center>
        <h1 className="mb-2 text-lg font-bold">الرموز الاحتياطية</h1>
        <p className="mb-3 text-sm text-red-600">
          احفظها الآن — تُعرض مرة واحدة فقط. كل رمز يُستخدم مرة.
        </p>
        <ul className="mb-4 grid grid-cols-2 gap-1 font-mono text-sm">
          {codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <a href="/claims" className="underline">حفظتها — المتابعة</a>
      </Center>
    );

  // enroll | challenge
  return (
    <Center>
      <h1 className="mb-4 text-lg font-bold">
        {mode === "enroll" ? "تسجيل المصادقة بخطوتين" : "تأكيد الدخول بخطوتين"}
      </h1>
      {mode === "enroll" && secret && (
        <div className="mb-4 text-sm">
          <p className="mb-1">أضف هذا المفتاح في تطبيق المصادقة (TOTP):</p>
          <code className="block break-all rounded bg-gray-100 p-2" data-testid="totp-secret">
            {secret}
          </code>
        </div>
      )}
      <input
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label="رمز التطبيق (6 أرقام)"
        placeholder="رمز التطبيق (6 أرقام)"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className="mb-3 rounded border p-2"
      />
      <button
        onClick={submitCode}
        disabled={busy || code.length < 6}
        className="rounded bg-black p-2 text-white disabled:opacity-50"
      >
        {busy ? "جارٍ التحقّق…" : "تحقّق"}
      </button>
      {mode === "challenge" && (
        <a href="/mfa/recovery" className="mt-3 text-sm underline">
          فقدتُ جهازي — استخدام رمز احتياطي
        </a>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </Center>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      {children}
    </main>
  );
}
