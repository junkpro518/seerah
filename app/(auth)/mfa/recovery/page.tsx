"use client";

import { useState } from "react";
import { recoverWithCode } from "@/lib/auth/actions";

export default function RecoveryPage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  if (done)
    return (
      <Center>
        <p className="mb-4">تم إلغاء المصادقة بخطوتين باستخدام الرمز الاحتياطي.</p>
        <a href="/mfa" className="underline">إعادة تسجيل 2FA الآن</a>
      </Center>
    );

  return (
    <Center>
      <h1 className="mb-4 text-lg font-bold">استعادة الدخول برمز احتياطي</h1>
      <input
        aria-label="الرمز الاحتياطي"
        placeholder="الرمز الاحتياطي"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className="mb-3 rounded border p-2 font-mono"
      />
      <button
        disabled={busy || code.length < 8}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await recoverWithCode(code);
          setBusy(false);
          if ("error" in res) return setError(res.error);
          setDone(true);
        }}
        className="rounded bg-black p-2 text-white disabled:opacity-50"
      >
        {busy ? "جارٍ التحقّق…" : "استعادة"}
      </button>
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
