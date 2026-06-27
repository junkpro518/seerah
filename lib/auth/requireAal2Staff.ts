import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { assertAal2 } from "./assertAal2";
import { getCurrentRole, isStaffRole, isAdminRole, type Role } from "./roles";

/**
 * حارس خادمي لكل عملية كتابة (T022 / SC-001): يثبت aal2 + دور موظّف **عبر جلسة المستخدم**
 * (RLS هو الحارس الفعلي؛ هذا يمنع مبكرًا ويحقّق الشرط المسبق لـ updateWithOptimisticLock).
 * يُرمى عند الإخفاق — لا يكتب شيئًا.
 */
export class NotStaffError extends Error {
  constructor(message = "هذه العملية تتطلّب دورًا ضمن فريق التحرير.") {
    super(message);
    this.name = "NotStaffError";
  }
}

export type AuthedStaff = {
  supabase: SupabaseClient;
  role: Role;
  userId: string;
};

export async function requireAal2Staff(): Promise<AuthedStaff> {
  const supabase = await createClient();
  await assertAal2(supabase); // يرمي Aal2RequiredError على aal1/null
  const role = await getCurrentRole(supabase);
  if (!isStaffRole(role)) throw new NotStaffError();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new NotStaffError();

  return { supabase, role, userId: user.id };
}

export async function requireAal2Admin(): Promise<AuthedStaff> {
  const authed = await requireAal2Staff();
  if (!isAdminRole(authed.role)) throw new NotStaffError("هذه العملية تتطلّب دور مدير.");
  return authed;
}
