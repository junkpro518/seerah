import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "موسوعة السيرة — أداة الإدخال",
  description: "أداة الإدخال والمراجعة لموسوعة السيرة النبوية الموثّقة",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
