/**
 * عقدة claimRef + اشتقاق الترقيم [n] + لون الهايلايت (لبنة ٣٣) — منطق نقيّ.
 *
 * - claimRef عقدة **سطرية** تحمل claimId، تُسلسَل داخل `body jsonb` القائم (لا تغيير مخطط).
 * - الترقيم [n] **يُشتقّ وقت العرض** من ترتيب الظهور لكل لغة، ولا يُخزَّن أبدًا.
 * - التكرار = **رقم ثابت للمعلومة** (قرار المالك 2026): أ،ب،أ → [1],[2],[1].
 * - الهايلايت من ألوان القوائم المرجعية (doc_grades/claim_types.color).
 */
export const CLAIM_REF_TYPE = "claimRef";

export type ClaimRefNode = { type: typeof CLAIM_REF_TYPE; attrs: { claimId: string } };

export function claimRefNode(claimId: string): ClaimRefNode {
  return { type: CLAIM_REF_TYPE, attrs: { claimId } };
}

type PMNode = {
  type?: string;
  attrs?: { claimId?: string } | null;
  content?: PMNode[] | null;
};

/** يجمع claimId لكل عُقَد claimRef بترتيب ظهورها في الوثيقة (يشمل التكرار). */
export function collectClaimRefs(doc: unknown): string[] {
  const out: string[] = [];
  const walk = (node: PMNode | null | undefined) => {
    if (!node || typeof node !== "object") return;
    if (node.type === CLAIM_REF_TYPE && node.attrs?.claimId) {
      out.push(node.attrs.claimId);
    }
    for (const child of node.content ?? []) walk(child);
  };
  walk(doc as PMNode);
  return out;
}

/**
 * خريطة claimId → رقم. كل معلومة متميّزة تأخذ رقمًا بترتيب أول ظهور؛ التكرار يعيد نفس الرقم.
 * يُحتسب وقت العرض لكل لغة على حدة (لا تخزين).
 */
export function deriveClaimNumbers(doc: unknown): Map<string, number> {
  const numbers = new Map<string, number>();
  let next = 1;
  for (const id of collectClaimRefs(doc)) {
    if (!numbers.has(id)) numbers.set(id, next++);
  }
  return numbers;
}

/** لون الهايلايت: درجة التوثيق أولًا، ثم نوع المعلومة، وإلا لا لون. */
export function claimHighlightColor(input: {
  gradeColor?: string | null;
  typeColor?: string | null;
}): string | null {
  return input.gradeColor || input.typeColor || null;
}
