import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * حارس SC-008: المفتاح السري (service role) في الخادم فقط — ممنوع في حزمة المتصفح.
 *
 * يفحص كل ملفات المصدر التي تعلن "use client" ويتأكّد أنها:
 *  - لا تستورد lib/supabase/admin (عميل الإدارة الخادمي)، و
 *  - لا تشير إلى SUPABASE_SERVICE_ROLE_KEY.
 * كما يمنع تسريب المفتاح عبر بادئة NEXT_PUBLIC_ في أي ملف.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const SCAN_DIRS = ["app", "lib"];

function collectSourceFiles(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(abs);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(abs, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectSourceFiles(path.join(dir, entry)));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function isClientComponent(src: string): boolean {
  // أول تعليمة غير فارغة هي "use client" (مع/بلا فاصلة منقوطة وعلامات اقتباس مفردة/مزدوجة)
  const head = src.replace(/^﻿/, "").trimStart();
  return /^["']use client["'];?/.test(head);
}

describe("SC-008: service role never reaches the browser bundle", () => {
  const files = SCAN_DIRS.flatMap(collectSourceFiles);

  it("finds source files to scan", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("no client component imports the admin (service-role) client", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (!isClientComponent(src)) continue;
      if (/from\s+["'][^"']*supabase\/admin["']/.test(src)) {
        offenders.push(path.relative(ROOT, file));
      }
    }
    expect(offenders, `client components importing admin.ts: ${offenders.join(", ")}`).toEqual([]);
  });

  it("no client component references SUPABASE_SERVICE_ROLE_KEY", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (!isClientComponent(src)) continue;
      if (src.includes("SUPABASE_SERVICE_ROLE_KEY")) {
        offenders.push(path.relative(ROOT, file));
      }
    }
    expect(offenders, `client components referencing service role key: ${offenders.join(", ")}`).toEqual([]);
  });

  it("service role key is never exposed via a NEXT_PUBLIC_ variable", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (/NEXT_PUBLIC_[A-Z_]*SERVICE_ROLE/.test(src)) {
        offenders.push(path.relative(ROOT, file));
      }
    }
    expect(offenders, `files exposing service role via NEXT_PUBLIC_: ${offenders.join(", ")}`).toEqual([]);
  });
});

describe("data layer never bypasses RLS via the admin (service-role) client", () => {
  // ثابت الطور ٢: طبقة الوصول تعتمد جلسة المستخدم + RLS فقط — لا تجاوز.
  const dataFiles = collectSourceFiles("lib/data");

  it("finds lib/data files to scan", () => {
    expect(dataFiles.length).toBeGreaterThan(0);
  });

  it("no lib/data module imports lib/supabase/admin", () => {
    const offenders: string[] = [];
    for (const file of dataFiles) {
      const src = readFileSync(file, "utf8");
      if (/from\s+["'][^"']*supabase\/admin["']/.test(src)) {
        offenders.push(path.relative(ROOT, file));
      }
    }
    expect(offenders, `lib/data modules importing admin.ts: ${offenders.join(", ")}`).toEqual([]);
  });
});
