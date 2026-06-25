/**
 * الربط الذكي (US6, FR-022): يقترح معلومات/مصادر قائمة ذات صلة بنصّ البحث أثناء التحرير.
 *
 * أمان وحدود:
 *  - **اقتراح للقراءة فقط** عبر العميل المُمرَّر (جلسة المستخدم / مفتاح anon المحترِم لـ RLS) —
 *    لا service_role. نطاق الرؤية فرضه RLS م٠: الطاقم يرى الكل، anon يرى المنشور/المعتمد فقط.
 *    (م٠ لا يميّز بين أدوار الطاقم هنا — كلّهم يرون الكل.) يُثبَت النطاق في E2E.
 *  - مدخل المستخدم لا يُحقَن في مرشّح PostgREST `.or()`: تُزال محارف القواعد وتُهرَّب أحرف LIKE.
 *  - حدّ معروف (P3): المطابقة `ilike` ساذجة لا تتجاوز التشكيل ولا تنويعات الحروف (ا/أ/إ/آ، ي/ى، ة/ه).
 */

export type ClaimSuggestion = { kind: "claim"; id: string; claimId: string; label: string };
export type SourceSuggestion = { kind: "source"; id: string; label: string; status: string };
export type Suggestion = ClaimSuggestion | SourceSuggestion;

const MIN_TERM_LEN = 2;
const DEFAULT_LIMIT = 8;

/** قصّ + ضمّ المسافات الداخلية. */
export function normalizeTerm(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/** لا نضرب القاعدة على نصّ أقصر من حدّين. */
export function isSearchable(raw: string, min: number = MIN_TERM_LEN): boolean {
  return normalizeTerm(raw).length >= min;
}

/**
 * نمط ilike آمن للاستخدام داخل `.or()`:
 *  1) إزالة محارف قواعد PostgREST التي تكسر المرشّح: , ( ) : *
 *  2) تهريب أحرف LIKE البدلية لتكون حرفية: \ % _
 *  3) الإحاطة بـ %...% للمطابقة الجزئية.
 */
export function toIlikePattern(raw: string): string {
  const stripped = normalizeTerm(raw).replace(/[,()*:]/g, " ").replace(/\s+/g, " ").trim();
  const escaped = stripped.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  return `%${escaped}%`;
}

/** مرشّح or على عدّة أعمدة بنمط واحد آمن. */
export function buildOrFilter(columns: string[], pattern: string): string {
  return columns.map((c) => `${c}.ilike.${pattern}`).join(",");
}

function relevance(term: string, label: string): number {
  const t = normalizeTerm(term);
  const l = label.trim();
  if (l === t) return 0; // مطابقة تامّة
  if (l.startsWith(t)) return 1; // بادئة
  return 2; // احتواء
}

/** ترتيب حسب الصلة (تامّة > بادئة > احتواء)، ثابت عند التساوي. */
export function rankSuggestions(term: string, items: Suggestion[]): Suggestion[] {
  return items
    .map((item, i) => ({ item, i, r: relevance(term, item.label) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.item);
}

type ClaimRow = { claim_id: string; title: string | null; summary: string | null };
type SourceRow = { id: string; title: string | null; status_code: string };

export function mapClaimRows(rows: ClaimRow[]): Suggestion[] {
  return rows.map((r) => ({
    kind: "claim",
    id: r.claim_id,
    claimId: r.claim_id,
    label: (r.title ?? r.summary ?? "").trim(),
  }));
}

export function mapSourceRows(rows: SourceRow[]): Suggestion[] {
  return rows.map((r) => ({
    kind: "source",
    id: r.id,
    label: (r.title ?? "").trim(),
    status: r.status_code,
  }));
}

// عميل Supabase ضيّق على ما نستعمله فقط (يقبل عميل المتصفّح/الخادم بجلسة المستخدم).
type QueryResult<T> = Promise<{ data: T[] | null; error: unknown }>;
type Filterable<T> = {
  select: (cols: string) => Filterable<T>;
  is: (col: string, val: null) => Filterable<T>;
  or: (expr: string) => Filterable<T>;
  limit: (n: number) => QueryResult<T>;
};
type SuggestClient = { from: (table: string) => Filterable<unknown> };

/**
 * يستعلم claim_translations + sources عبر العميل المُمرَّر (RLS) ويعيد اقتراحات مرتّبة.
 * لا يضرب القاعدة على نصّ قصير.
 */
export async function suggestLinks(
  client: SuggestClient,
  raw: string,
  limit: number = DEFAULT_LIMIT,
): Promise<Suggestion[]> {
  if (!isSearchable(raw)) return [];
  const pattern = toIlikePattern(raw);

  const claimsP = (client.from("claim_translations") as Filterable<ClaimRow>)
    .select("claim_id, title, summary")
    .is("deleted_at", null)
    .or(buildOrFilter(["title", "summary"], pattern))
    .limit(limit);

  const sourcesP = (client.from("sources") as Filterable<SourceRow>)
    .select("id, title, status_code")
    .is("deleted_at", null)
    .or(buildOrFilter(["title", "author"], pattern))
    .limit(limit);

  const [claims, sources] = await Promise.all([claimsP, sourcesP]);

  const merged = [
    ...mapClaimRows((claims.data ?? []) as ClaimRow[]),
    ...mapSourceRows((sources.data ?? []) as SourceRow[]),
  ].filter((s) => s.label.length > 0);

  return rankSuggestions(raw, merged).slice(0, limit);
}
