"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CONTAINER_TYPES, type ContainerType } from "@/lib/claims/rules";
import {
  createClaim,
  saveClaimText,
  linkCitation,
  submitClaim,
} from "@/lib/claims/actions";

type Lookup = { code: string };
type Grade = { code: string; requires_grading_source: boolean };

const CONTAINER_LABEL: Record<ContainerType, string> = {
  event: "حدث",
  person: "شخص",
  location: "مكان",
};

export default function ClaimEditorPage() {
  const [claimTypes, setClaimTypes] = useState<Lookup[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [relations, setRelations] = useState<Lookup[]>([]);

  const [containerType, setContainerType] = useState<ContainerType>("event");
  const [containerId, setContainerId] = useState("");
  const [claimTypeCode, setClaimTypeCode] = useState("");
  const [docGradeCode, setDocGradeCode] = useState("");

  const [claim, setClaim] = useState<{ id: string; updated_at: string } | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [textRow, setTextRow] = useState<{ id: string; updatedAt: string } | null>(null);

  const [citationId, setCitationId] = useState("");
  const [relationCode, setRelationCode] = useState("primary");

  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const [ct, dg, cr] = await Promise.all([
        supabase.from("claim_types").select("code").order("sort_order"),
        supabase.from("doc_grades").select("code, requires_grading_source").order("sort_order"),
        supabase.from("citation_relations").select("code").order("sort_order"),
      ]);
      setClaimTypes(ct.data ?? []);
      setGrades((dg.data as Grade[]) ?? []);
      setRelations(cr.data ?? []);
      if (ct.data?.[0]) setClaimTypeCode(ct.data[0].code);
      if (dg.data?.[0]) setDocGradeCode((dg.data as Grade[])[0].code);
    })();
  }, []);

  const gradeNeedsSource = grades.find((g) => g.code === docGradeCode)?.requires_grading_source;

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
    <section className="max-w-2xl space-y-8">
      <h1 className="text-xl font-bold">محرّر المعلومة</h1>

      {/* البنية */}
      <fieldset className="space-y-2 rounded border p-4">
        <legend className="px-1 font-semibold">البنية</legend>
        <div className="flex gap-2">
          <select
            value={containerType}
            onChange={(e) => setContainerType(e.target.value as ContainerType)}
            className="rounded border p-2"
          >
            {CONTAINER_TYPES.map((t) => (
              <option key={t} value={t}>{CONTAINER_LABEL[t]}</option>
            ))}
          </select>
          <input
            placeholder="معرّف الحاوية"
            value={containerId}
            onChange={(e) => setContainerId(e.target.value)}
            className="flex-1 rounded border p-2 font-mono"
          />
        </div>
        <select value={claimTypeCode} onChange={(e) => setClaimTypeCode(e.target.value)} className="w-full rounded border p-2">
          {claimTypes.map((t) => <option key={t.code} value={t.code}>{t.code}</option>)}
        </select>
        <select value={docGradeCode} onChange={(e) => setDocGradeCode(e.target.value)} className="w-full rounded border p-2">
          {grades.map((g) => <option key={g.code} value={g.code}>{g.code}</option>)}
        </select>
        {gradeNeedsSource && (
          <p className="text-sm text-amber-700">
            هذه الدرجة تتطلّب استشهادًا بمصدر حكم (grading_source) عند التقديم.
          </p>
        )}
        <button
          disabled={!containerId || !!claim}
          onClick={async () =>
            report(
              await createClaim({ containerType, containerId, claimTypeCode, docGradeCode }).then((r) => {
                if ("ok" in r) setClaim(r.data);
                return r;
              }),
              "أُنشئت المعلومة (مسودّة).",
            )
          }
          className="rounded bg-black p-2 text-white disabled:opacity-50"
        >
          إنشاء المعلومة
        </button>
      </fieldset>

      {claim && (
        <>
          {/* النصّ */}
          <fieldset className="space-y-2 rounded border p-4">
            <legend className="px-1 font-semibold">النصّ (عربي)</legend>
            <input placeholder="العنوان" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded border p-2" />
            <textarea placeholder="الملخّص/العبارة" value={summary} onChange={(e) => setSummary(e.target.value)} className="w-full rounded border p-2" />
            <button
              onClick={async () =>
                report(
                  await saveClaimText({
                    claimId: claim.id,
                    lang: "ar",
                    title,
                    summary,
                    existing: textRow ?? undefined,
                  }).then((r) => {
                    if ("ok" in r) setTextRow({ id: r.data.id, updatedAt: r.data.updated_at });
                    return r;
                  }),
                  "حُفظ النصّ.",
                )
              }
              className="rounded bg-black p-2 text-white"
            >
              حفظ النصّ
            </button>
          </fieldset>

          {/* الاستشهادات */}
          <fieldset className="space-y-2 rounded border p-4">
            <legend className="px-1 font-semibold">الاستشهادات (من مصادر معتمدة فقط)</legend>
            <input placeholder="معرّف الاستشهاد" value={citationId} onChange={(e) => setCitationId(e.target.value)} className="w-full rounded border p-2 font-mono" />
            <select value={relationCode} onChange={(e) => setRelationCode(e.target.value)} className="w-full rounded border p-2">
              {relations.map((r) => <option key={r.code} value={r.code}>{r.code}</option>)}
            </select>
            <button
              disabled={!citationId}
              onClick={async () =>
                report(await linkCitation({ claimId: claim.id, citationId, relationCode }), "رُبط الاستشهاد.")
              }
              className="rounded bg-black p-2 text-white disabled:opacity-50"
            >
              ربط استشهاد
            </button>
          </fieldset>

          {/* التقديم */}
          <fieldset className="space-y-2 rounded border p-4">
            <legend className="px-1 font-semibold">التقديم للمراجعة</legend>
            <button
              onClick={async () =>
                report(
                  await submitClaim({ id: claim.id, loadedUpdatedAt: claim.updated_at }).then((r) => {
                    if ("ok" in r) setClaim(r.data);
                    return r;
                  }),
                  "قُدّمت المعلومة للمراجعة.",
                )
              }
              className="rounded bg-green-700 p-2 text-white"
            >
              تقديم
            </button>
          </fieldset>
        </>
      )}

      {msg && <p className="text-sm text-green-700">{msg}</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}
    </section>
  );
}
