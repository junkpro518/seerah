import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * تكامل: يعمل ضد مكدّس Supabase **محلي زائل** فقط (supabase start + db reset).
 * لا يمسّ السحابي. يحتاج بيئة: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (من `supabase status`).
 * إن غابت المفاتيح، تتخطّى الاختبارات نفسها (لا تفشل) — انظر الملف.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.int.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
