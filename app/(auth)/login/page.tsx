"use client";

import { useState, useTransition } from "react";
import { signIn } from "@/lib/auth/actions";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <h1 className="mb-6 text-xl font-bold">تسجيل الدخول</h1>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setError(null);
          startTransition(async () => {
            const res = await signIn(fd);
            if (res?.error) setError(res.error);
          });
        }}
      >
        <input
          name="email"
          type="email"
          required
          placeholder="البريد الإلكتروني"
          className="rounded border p-2"
        />
        <input
          name="password"
          type="password"
          required
          placeholder="كلمة المرور"
          className="rounded border p-2"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-black p-2 text-white disabled:opacity-50"
        >
          {pending ? "جارٍ الدخول…" : "دخول"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </main>
  );
}
