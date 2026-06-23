"use client";

import { useState } from "react";
import { adminResetMfa } from "@/lib/auth/actions";

export default function AdminPage() {
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <section className="max-w-md">
      <h1 className="mb-4 text-lg font-bold">الإدارة — إعادة تعيين 2FA</h1>
      <p className="mb-3 text-sm text-gray-600">
        لعضو فقد جهازه ورموزه الاحتياطية: يُحذف عامل المصادقة فيُعيد التسجيل.
      </p>
      <input
        placeholder="معرّف المستخدم (user id)"
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        className="mb-3 w-full rounded border p-2 font-mono"
      />
      <button
        disabled={busy || userId.length < 10}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          const res = await adminResetMfa(userId.trim());
          setBusy(false);
          setMsg("error" in res ? res.error : "تم إعادة تعيين 2FA للعضو.");
        }}
        className="rounded bg-black p-2 text-white disabled:opacity-50"
      >
        {busy ? "جارٍ…" : "إعادة التعيين"}
      </button>
      {msg && <p className="mt-3 text-sm">{msg}</p>}
    </section>
  );
}
