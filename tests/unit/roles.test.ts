import { describe, it, expect } from "vitest";
import { isStaffRole, isAdminRole, STAFF_ROLES } from "@/lib/auth/roles";

/**
 * وحدة: معينات الأدوار (تطابق م٠: author/shariah_reviewer/editor/admin).
 * staff = الأربعة؛ admin = admin فقط. (حارس تجربة؛ RLS م٠ هو الفرض الفعلي.)
 */
describe("role predicates", () => {
  it("STAFF_ROLES matches m0 role codes exactly", () => {
    expect([...STAFF_ROLES].sort()).toEqual(
      ["admin", "author", "editor", "shariah_reviewer"].sort(),
    );
  });

  it("isStaffRole true for every staff role", () => {
    for (const r of STAFF_ROLES) expect(isStaffRole(r)).toBe(true);
  });

  it("isStaffRole false for unknown / null / empty", () => {
    expect(isStaffRole("guest")).toBe(false);
    expect(isStaffRole(null)).toBe(false);
    expect(isStaffRole(undefined)).toBe(false);
    expect(isStaffRole("")).toBe(false);
  });

  it("isAdminRole true only for admin", () => {
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole("editor")).toBe(false);
    expect(isAdminRole("author")).toBe(false);
    expect(isAdminRole(null)).toBe(false);
  });
});
