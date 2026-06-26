"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getCurrentRole, isAdminRole, type Role } from "@/lib/auth/roles";
import { proposeSource, approveSource } from "@/lib/sources/actions";

type SourceRow = {
  id: string;
  title: string;
  status_code: string;
  source_type_code: string;
  updated_at: string;
};

export default function SourcesPage() {
  const [role, setRole] = useState<Role | null>(null);
  const [types, setTypes] = useState<{ code: string }[]>([]);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [title, setTitle] = useState("");
  const [sourceTypeCode, setSourceTypeCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const supabase = createClient();
  const isAdmin = isAdminRole(role);

  async function loadSources() {
    const { data } = await supabase
      .from("sources")
      .select("id, title, status_code, source_type_code, updated_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    setSources((data as SourceRow[]) ?? []);
  }

  useEffect(() => {
    getCurrentRole(supabase).then(setRole);
    supabase
      .from("source_types")
      .select("code")
      .order("sort_order")
      .then(({ data }) => {
        setTypes(data ?? []);
        if (data?.[0]) setSourceTypeCode(data[0].code);
      });
    loadSources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function report(res: { error: string } | { ok: true }, okMsg: string) {
    if ("error" in res) {
      setErr(res.error);
      setMsg(null);
    } else {
      setMsg(okMsg);
      setErr(null);
    }
  }

  return (
    <section className="max-w-2xl space-y-6">
      <h1 className="text-xl font-bold">المصادر</h1>
      <p className="text-sm text-gray-600">دورك: {role ?? "—"}</p>

      <fieldset className="space-y-2 rounded border p-4">
        <legend className="px-1 font-semibold">اقتراح مصدر</legend>
        <input aria-label="عنوان المصدر" placeholder="العنوان" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded border p-2" />
        <select aria-label="نوع المصدر" value={sourceTypeCode} onChange={(e) => setSourceTypeCode(e.target.value)} className="w-full rounded border p-2">
          {types.map((t) => <option key={t.code} value={t.code}>{t.code}</option>)}
        </select>
        <button
          disabled={!title.trim()}
          onClick={async () => {
            const res = await proposeSource({ title, sourceTypeCode });
            report(res, "اقتُرح المصدر (proposed).");
            if ("ok" in res) {
              setTitle("");
              await loadSources();
            }
          }}
          className="rounded bg-black p-2 text-white disabled:opacity-50"
        >
          اقتراح
        </button>
      </fieldset>

      <div className="space-y-2">
        <h2 className="font-semibold">القائمة</h2>
        {sources.map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded border p-2 text-sm">
            <span>{s.title} — <span className="font-mono">{s.status_code}</span></span>
            {isAdmin && s.status_code === "proposed" && (
              <button
                onClick={async () => {
                  const res = await approveSource({ id: s.id, loadedUpdatedAt: s.updated_at });
                  report(res, "اعتُمد المصدر.");
                  if ("ok" in res) await loadSources();
                }}
                className="rounded bg-green-700 px-3 py-1 text-white"
              >
                اعتماد
              </button>
            )}
          </div>
        ))}
      </div>

      {msg && <p className="text-sm text-green-700">{msg}</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}
    </section>
  );
}
