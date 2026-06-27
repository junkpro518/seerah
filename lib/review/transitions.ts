/**
 * مرآة جدول م٠ `review_transitions` (0011) — تُستخدم لعرض الانتقالات المسموحة في الواجهة.
 *
 * لماذا مرآة لا قراءة وقت التشغيل: سياسة م٠ تجعل `review_transitions` **مقروءًا للمدير فقط**
 * (0015)، فقراءته بجلسة موظّف غير مدير تُرجع صفرًا؛ وقيد «صفر ترحيلات م١» يمنع تعديل تلك
 * السياسة هذا الطور. لذا نعكس الجدول هنا، و**م٠ (المحفّز) يبقى الفارض الفعلي**.
 * التطابق مع القاعدة مضمون باختبار tests/integration/transitions-parity.int.test.ts.
 */
export type Layer = "structure" | "translation";
export type ReviewTransition = { layer: Layer; from: string; to: string; role: string };

export const REVIEW_TRANSITIONS: ReviewTransition[] = [
  // structure: shariah -> editorial -> publish
  { layer: "structure", from: "draft", to: "submitted", role: "author" },
  { layer: "structure", from: "submitted", to: "shariah_approved", role: "shariah_reviewer" },
  { layer: "structure", from: "submitted", to: "needs_revision", role: "shariah_reviewer" },
  { layer: "structure", from: "submitted", to: "rejected", role: "shariah_reviewer" },
  { layer: "structure", from: "shariah_approved", to: "approved", role: "editor" },
  { layer: "structure", from: "shariah_approved", to: "needs_revision", role: "editor" },
  { layer: "structure", from: "shariah_approved", to: "rejected", role: "editor" },
  { layer: "structure", from: "approved", to: "published", role: "admin" },
  { layer: "structure", from: "approved", to: "needs_revision", role: "admin" },
  { layer: "structure", from: "published", to: "approved", role: "admin" },
  { layer: "structure", from: "needs_revision", to: "submitted", role: "author" },
  // translation: editorial -> publish only (no shariah)
  { layer: "translation", from: "draft", to: "submitted", role: "author" },
  { layer: "translation", from: "submitted", to: "approved", role: "editor" },
  { layer: "translation", from: "submitted", to: "needs_revision", role: "editor" },
  { layer: "translation", from: "submitted", to: "rejected", role: "editor" },
  { layer: "translation", from: "approved", to: "published", role: "admin" },
  { layer: "translation", from: "approved", to: "needs_revision", role: "admin" },
  { layer: "translation", from: "published", to: "approved", role: "admin" },
  { layer: "translation", from: "needs_revision", to: "submitted", role: "author" },
];

/** الانتقالات المتاحة لـ (الطبقة، الحالة، الدور) — المسموح فقط. */
export function availableTransitions(input: {
  layer: Layer;
  from: string;
  role: string;
}): ReviewTransition[] {
  return REVIEW_TRANSITIONS.filter(
    (t) => t.layer === input.layer && t.from === input.from && t.role === input.role,
  );
}

/** الطبقة من اسم الجدول: *_translations = ترجمة، وإلا بنية. */
export function layerForTable(table: string): Layer {
  return table.endsWith("_translations") ? "translation" : "structure";
}
