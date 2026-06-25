import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import path from "node:path";

/**
 * SC-009 guard (T043): م١ يضيف **صفر ترحيلات**. كل تغيير مخطط يبقى في مسار م٠.
 * خطّ الأساس = ترحيلات م٠، **ويشمل 0016** (إصلاح م٠ مأذون نُقل إلى master عبر
 * cherry-pick — ليس ترحيلًا أضافه م١). أي ملف ترحيل جديد على فرع م١ يكسر هذا الحارس.
 */
const M0_BASELINE = [
  "20260619194844_enable_pgtap.sql",
  "20260620124556_0001_languages.sql",
  "20260620124829_0002_lookups.sql",
  "20260620125103_0003_profiles.sql",
  "20260620125642_0004_sources_citations.sql",
  "20260620130031_0005_content_entities.sql",
  "20260620130354_0006_translations.sql",
  "20260620130704_0007_claims.sql",
  "20260620130958_0008_join_tables.sql",
  "20260620131348_0009_content_notes.sql",
  "20260621075953_0010_body_plain.sql",
  "20260621082331_0011_state_machine.sql",
  "20260621084607_0012_audit.sql",
  "20260621103150_0013_audit_reference_tables.sql",
  "20260621140856_0014_outbox.sql",
  "20260621143541_0015_rls.sql",
  "20260624125422_0016_claim_citations_grants.sql",
];

describe("SC-009: M1 introduces no new migrations", () => {
  it("supabase/migrations equals the M0 baseline (0016 = authorized M0 fix, not M1-added)", () => {
    const dir = path.resolve(__dirname, "..", "..", "supabase", "migrations");
    const actual = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    expect(actual).toEqual([...M0_BASELINE].sort());
  });
});
