"use client";

import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { createClient } from "@/lib/supabase/client";
import { ClaimRef } from "@/lib/editor/claim-ref-node";
import { CLAIM_REF_TYPE, collectClaimRefs } from "@/lib/editor/claim-ref";
import { saveNarrative, type NarrativeEntityType } from "@/lib/narrative/actions";

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
    if (data?.body) {
      editor.commands.setContent(data.body as object);
      setExisting({ id: data.id as string, updatedAt: data.updated_at as string });
    } else {
      setExisting(null);
    }
    await refreshColors();
  }

  function insertClaimRef() {
    if (!editor) return;
    const claimId = window.prompt("معرّف المعلومة (claimId):")?.trim();
    if (!claimId) return;
    editor.chain().focus().insertContent({ type: CLAIM_REF_TYPE, attrs: { claimId } }).run();
    void refreshColors();
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
        <select value={entityType} onChange={(e) => setEntityType(e.target.value as NarrativeEntityType)} className="rounded border p-2">
          {ENTITY_TYPES.map((t) => <option key={t} value={t}>{ENTITY_LABEL[t]}</option>)}
        </select>
        <input placeholder="معرّف الكيان" value={entityId} onChange={(e) => setEntityId(e.target.value)} className="flex-1 rounded border p-2 font-mono" />
        <button onClick={loadExisting} disabled={!entityId} className="rounded border px-3 disabled:opacity-50">تحميل</button>
      </div>

      <div className="flex gap-2">
        <button onClick={insertClaimRef} className="rounded border px-3 py-1 text-sm">إدراج إشارة معلومة [n]</button>
      </div>

      <EditorContent editor={editor} />

      <button onClick={save} disabled={!entityId} className="rounded bg-black p-2 text-white disabled:opacity-50">حفظ السرد</button>

      {msg && <p className="text-sm text-green-700">{msg}</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}
    </section>
  );
}
