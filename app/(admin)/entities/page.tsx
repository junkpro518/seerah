"use client";

import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { createClient } from "@/lib/supabase/client";
import { ClaimRef } from "@/lib/editor/claim-ref-node";
import { CLAIM_REF_TYPE, collectClaimRefs } from "@/lib/editor/claim-ref";
import { saveNarrative, type NarrativeEntityType } from "@/lib/narrative/actions";
import { suggestLinks, type Suggestion } from "@/lib/editor/smart-link";

const ENTITY_TYPES: NarrativeEntityType[] = ["event", "person", "location"];
const ENTITY_LABEL: Record<NarrativeEntityType, string> = {
  event: "حدث",
  person: "شخص",
  location: "مكان",
};

export default function NarrativeEditorPage() {
  const [entityType, setEntityType] = useState<NarrativeEntityType>("event");
  const [entityId, setEntityId] = useState("");
  const [lang] = useState("ar");
  const [existing, setExisting] = useState<{ id: string; updatedAt: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const editor = useEditor({
    extensions: [StarterKit, ClaimRef],
    content: { type: "doc", content: [{ type: "paragraph" }] },
    immediatelyRender: false,
    editorProps: { attributes: { class: "min-h-40 rounded border p-3 leading-loose" } },
  });

  // ألوان الهايلايت للمعلومات المشار إليها (من doc_grades/claim_types.color)
  async function refreshColors() {
    if (!editor) return;
    const ids = Array.from(new Set(collectClaimRefs(editor.getJSON())));
    if (ids.length === 0) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("claims")
      .select("id, grade:doc_grades(color), type:claim_types(color)")
      .in("id", ids);
    const colors: Record<string, { gradeColor?: string | null; typeColor?: string | null }> = {};
    for (const row of (data ?? []) as Array<{
      id: string;
      grade?: { color?: string | null };
      type?: { color?: string | null };
    }>) {
      colors[row.id] = { gradeColor: row.grade?.color, typeColor: row.type?.color };
    }
    (editor.storage as unknown as Record<string, { colors: typeof colors }>)[CLAIM_REF_TYPE].colors = colors;
    editor.view.dispatch(editor.state.tr); // إعادة رسم عُقَد الإشارة
  }

  async function loadExisting() {
    if (!editor || !entityId) return;
    setMsg(null);
    setErr(null);
    const supabase = createClient();
    const { data } = await supabase
      .from(`${entityType}_translations`)
      .select("id, body, updated_at")
      .eq(`${entityType}_id`, entityId)
      .eq("lang", lang)
      .is("deleted_at", null)
      .maybeSingle();
    if (data) {
      // body في م٠ افتراضه '{}' (ليس وثيقة ProseMirror صالحة) — fallback لوثيقة فارغة
      const body = data.body as { type?: string } | null;
      const doc = body && body.type === "doc" ? body : { type: "doc", content: [{ type: "paragraph" }] };
      editor.commands.setContent(doc as object);
      setExisting({ id: data.id as string, updatedAt: data.updated_at as string });
    } else {
      setExisting(null);
    }
    await refreshColors();
  }

  function insertClaimRef(claimId: string) {
    if (!editor || !claimId) return;
    editor.chain().focus().insertContent({ type: CLAIM_REF_TYPE, attrs: { claimId } }).run();
    void refreshColors();
  }

  // الربط الذكي (US6): اقتراحات معلومات/مصادر قائمة عبر جلسة المستخدم (RLS) — لا service_role.
  async function runSearch() {
    const out = await suggestLinks(createClient(), query);
    setSuggestions(out);
  }

  async function save() {
    if (!editor) return;
    const res = await saveNarrative({
      entityType,
      entityId,
      lang,
      bodyJson: editor.getJSON(),
      existing: existing ?? undefined,
    });
    if ("error" in res) {
      setErr(res.error);
      setMsg(null);
    } else {
      setExisting({ id: res.data.id, updatedAt: res.data.updated_at });
      setMsg("حُفظ السرد.");
      setErr(null);
    }
  }

  useEffect(() => () => editor?.destroy(), [editor]);

  return (
    <section className="max-w-3xl space-y-4">
      <h1 className="text-xl font-bold">المحرّر الغني — سرد الكيان</h1>

      <div className="flex gap-2">
        <select aria-label="نوع الكيان" value={entityType} onChange={(e) => setEntityType(e.target.value as NarrativeEntityType)} className="rounded border p-2">
          {ENTITY_TYPES.map((t) => <option key={t} value={t}>{ENTITY_LABEL[t]}</option>)}
        </select>
        <input aria-label="معرّف الكيان" placeholder="معرّف الكيان" value={entityId} onChange={(e) => setEntityId(e.target.value)} className="flex-1 rounded border p-2 font-mono" />
        <button onClick={loadExisting} disabled={!entityId} className="rounded border px-3 disabled:opacity-50">تحميل</button>
      </div>

      <fieldset className="space-y-2 rounded border p-3">
        <legend className="px-1 text-sm font-semibold">ربط ذكي — اقتراح معلومات/مصادر قائمة</legend>
        <div className="flex gap-2">
          <input
            aria-label="بحث الربط الذكي"
            placeholder="ابحث باسم/مصطلح…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runSearch();
            }}
            className="flex-1 rounded border p-2"
          />
          <button onClick={() => void runSearch()} className="rounded border px-3 text-sm">بحث</button>
        </div>
        {suggestions.length > 0 && (
          <ul className="space-y-1">
            {suggestions.map((s) => (
              <li key={`${s.kind}:${s.id}`} className="flex items-center justify-between rounded border p-2 text-sm">
                <span>
                  <span className="font-mono text-xs text-gray-500">{s.kind === "claim" ? "معلومة" : `مصدر · ${s.status}`}</span>{" "}
                  {s.label}
                </span>
                {s.kind === "claim" && (
                  <button onClick={() => insertClaimRef(s.claimId)} className="rounded border px-2 py-0.5 text-xs">
                    إدراج إشارة [n]
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <EditorContent editor={editor} />

      <button onClick={save} disabled={!entityId} className="rounded bg-black p-2 text-white disabled:opacity-50">حفظ السرد</button>

      {msg && <p className="text-sm text-green-700">{msg}</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}
    </section>
  );
}
