import { describe, it, expect } from "vitest";
import { assertAal2, Aal2RequiredError } from "@/lib/auth/assertAal2";

/**
 * وحدة: حارس aal2 (FR-004 / SC-001).
 * يعتمد على supabase.auth.mfa.getAuthenticatorAssuranceLevel() →
 *   { data: { currentLevel: 'aal1'|'aal2'|null, ... }, error }.
 * الكتابة بلا aal2 تُرفض برسالة واضحة (Aal2RequiredError) لا خطأ خام.
 */
function makeClient(currentLevel: string | null, error: unknown = null) {
  return {
    auth: {
      mfa: {
        getAuthenticatorAssuranceLevel: () =>
          Promise.resolve({ data: error ? null : { currentLevel, nextLevel: currentLevel }, error }),
      },
    },
  };
}

describe("assertAal2 (FR-004 / SC-001)", () => {
  it("rejects an aal1 session with Aal2RequiredError (clear, not raw)", async () => {
    await expect(assertAal2(makeClient("aal1") as never)).rejects.toBeInstanceOf(Aal2RequiredError);
  });

  it("rejects when there is no session level (null)", async () => {
    await expect(assertAal2(makeClient(null) as never)).rejects.toBeInstanceOf(Aal2RequiredError);
  });

  it("resolves for an aal2 session", async () => {
    await expect(assertAal2(makeClient("aal2") as never)).resolves.toBeUndefined();
  });

  it("rejects with Aal2RequiredError when the AAL lookup errors", async () => {
    await expect(
      assertAal2(makeClient(null, { message: "no session" }) as never),
    ).rejects.toBeInstanceOf(Aal2RequiredError);
  });
});
