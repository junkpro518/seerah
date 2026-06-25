"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getCurrentRole, type Role } from "@/lib/auth/roles";
import { availableTransitions, layerForTable } from "@/lib/review/transitions";
import { applyTransition } from "@/lib/review/actions";

const TABLES = [
  "events",
  "persons",
  "locations",
  "claims",
  "event_translations",
  "person_translations",
  "location_translations",
  "claim_translations",
];

export default function ReviewPage() {
  const [role, setRole] = useState<Role | null>(null);
  const [table, setTable] = useState("events");
  const [id, setId] = useState("");
  const [row, setRow] = useState<{ status: string; updatedAt: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getCurrentRole(createClient()).then(setRole);
  }, []);

  async function load() {
    setMsg(null);
    setErr(null);
    setRow(null);
    const { data, error } = await createClient()
      .from(table)
      .select("review_status_code, updated_at")
      .eq("id", id)
      .single();
    if (error || !data) {
      setErr("تعذّر تحميل السجل.");
      return;
    }
    setRow({ status: data.review_status_code as string, updatedAt: data.updated_at as string });
  }

  const transitions = row && role
    ? availableTransitions({ layer: layerForTable(table), from: row.status, role })
    : [];

  return (
    <section className="max-w-xl space-y-4">
      <h1 className="text-xl font-bold">لوحة المراجعة</h1>
      <p className="text-sm text-gray-600">دورك: {role ?? "—"}</p>

      <div className="flex gap-2">
        <select value={table} onChange={(e) => setTable(e.target.value)} className="rounded border p-2">
          {TABLES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input placeholder="معرّف السجل" value={id} onChange={(e) => setId(e.target.value)} className="flex-1 rounded border p-2 font-mono" />
        <button onClick={load} disabled={!id} className="rounded border px-3 disabled:opacity-50">تحميل</button>
      </div>

      {row && (
        <div className="space-y-3 rounded border p-4">
          <p>الحالة الحالية: <span className="font-mono">{row.status}</span></p>
          {transitions.length === 0 ? (
            <p className="text-sm text-gray-600">لا انتقالات متاحة لدورك من هذه الحالة.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {transitions.map((t) => (
                <button
                  key={t.to}
                  onClick={async () => {
                    const res = await applyTransition({
                      table,
                      id,
                      toState: t.to,
                      loadedUpdatedAt: row.updatedAt,
                    });
                    if ("error" in res) {
                      setErr(res.error);
                      setMsg(null);
                    } else {
                      setRow({ status: res.data.review_status_code, updatedAt: res.data.updated_at });
                      setMsg(`تمّ الانتقال إلى ${res.data.review_status_code}.`);
                      setErr(null);
                    }
                  }}
                  className="rounded bg-black px-3 py-1 text-sm text-white"
                >
                  {t.to}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {msg && <p className="text-sm text-green-700">{msg}</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}
    </section>
  );
}
