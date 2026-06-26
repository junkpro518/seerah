import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // حزمة تشغيل قائمة بذاتها لصورة Docker سليمة (نشر Coolify/Contabo).
  output: "standalone",
  // ثبّت جذر التتبّع على مجلد المشروع — وإلا استنتج Next جذرًا أعلى (بسبب lockfile
  // في المنزل) فتُعشَّش حزمة standalone تحت مسار فرعي ويفشل مسار Dockerfile.
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
