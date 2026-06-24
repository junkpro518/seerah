#!/usr/bin/env node
/**
 * كاشف حالة E2E — يعتمد **حكم Playwright** من تقرير JSON، لا مطابقة نصّية للسجل.
 *
 * السبب: مطابقة السجل تُخطئ (مثلًا ظهور "--no-sandbox" في سجل Chromium ظُنّ تخطّيًا).
 * المصدر الوحيد للحقيقة: test-results/e2e-results.json (مُولَّد من مُبلِّغ json في
 * playwright.config.ts) — حقول stats: expected (نجح) / unexpected (فشل) / flaky / skipped.
 *
 * يطبع سطرًا واحدًا: E2E_STATUS=PASSED|FAILED|SKIPPED|NO_TESTS|UNKNOWN
 * ويخرج بـ 1 عند FAILED أو UNKNOWN (تقرير غائب/تالف) وإلا 0.
 *
 * الاستخدام: node scripts/e2e-status.mjs [path-to-results.json]
 */
import { readFileSync } from "node:fs";

const reportPath = process.argv[2] ?? "test-results/e2e-results.json";

function emit(status, detail) {
  console.log(`E2E_STATUS=${status}`);
  if (detail) console.log(detail);
  const failed = status === "FAILED" || status === "UNKNOWN";
  process.exit(failed ? 1 : 0);
}

let report;
try {
  report = JSON.parse(readFileSync(reportPath, "utf8"));
} catch (e) {
  emit("UNKNOWN", `تعذّر قراءة تقرير Playwright (${reportPath}): ${e.message}`);
}

// نفضّل stats الرسمية؛ وإلا نمشي على الـ specs كاحتياط.
let expected = report?.stats?.expected;
let unexpected = report?.stats?.unexpected;
let flaky = report?.stats?.flaky;
let skipped = report?.stats?.skipped;

if (expected == null || unexpected == null) {
  expected = 0;
  unexpected = 0;
  flaky = 0;
  skipped = 0;
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const s = t.status ?? t.results?.at(-1)?.status;
        if (s === "skipped") skipped++;
        else if (spec.ok) expected++;
        else unexpected++;
      }
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report?.suites ?? []) walk(suite);
}

const summary = `expected=${expected} unexpected=${unexpected} flaky=${flaky ?? 0} skipped=${skipped ?? 0}`;

if (unexpected > 0) emit("FAILED", summary);
if (expected > 0 || (flaky ?? 0) > 0) emit("PASSED", summary);
if ((skipped ?? 0) > 0) emit("SKIPPED", summary);
emit("NO_TESTS", summary);
