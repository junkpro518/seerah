# أداة الإدخال (م١) — صورة نشر قائمة بذاتها لـ Coolify/Contabo.
# تعتمد على next.config.ts: output:"standalone". لا أسرار تُخبز في الصورة؛
# المتغيّرات تُحقن وقت التشغيل (service_role خادمي حصرًا — لا NEXT_PUBLIC_).

# 1) التبعيات (مع تفعيل بناء esbuild/sharp عبر pnpm-workspace.yaml)
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# 2) البناء
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# مفاتيح NEXT_PUBLIC_ تُمرَّر وقت البناء فقط إن لزمت للتضمين الثابت؛
# هنا التطبيق ديناميكي فلا حاجة لخبزها. لا تمرّر service_role هنا إطلاقًا.
RUN pnpm build

# 3) التشغيل — مستخدم غير جذري، حزمة standalone فقط
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
