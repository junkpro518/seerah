import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { CLAIM_REF_TYPE, deriveClaimNumbers, claimHighlightColor } from "./claim-ref";

/**
 * عقدة TipTap claimRef: سطرية (inline)، ذرّية (atom)، تحمل claimId. تُسلسَل ضمن
 * `body jsonb` القائم (لا تغيير مخطط). [n] والهايلايت يُشتقّان وقت العرض من الوثيقة
 * والقوائم المرجعية — لا تُخزَّن أرقام.
 */

type ColorEntry = { gradeColor?: string | null; typeColor?: string | null };

function ClaimRefView({ node, editor }: ReactNodeViewProps) {
  const claimId = (node.attrs as { claimId?: string }).claimId ?? "";
  const numbers = deriveClaimNumbers(editor.getJSON());
  const n = numbers.get(claimId);
  const storage = editor.storage as unknown as Record<string, { colors?: Record<string, ColorEntry> }>;
  const colors = storage[CLAIM_REF_TYPE]?.colors ?? {};
  const color = claimHighlightColor(colors[claimId] ?? {});

  return (
    <NodeViewWrapper
      as="span"
      className="mx-0.5 inline-flex items-center rounded px-1 text-xs"
      style={{ backgroundColor: color ?? "#eee" }}
      data-claim-ref
      data-claim-id={claimId}
      title={claimId}
    >
      [{n ?? "?"}]
    </NodeViewWrapper>
  );
}

export const ClaimRef = Node.create({
  name: CLAIM_REF_TYPE,
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addStorage() {
    return { colors: {} as Record<string, ColorEntry> };
  },

  addAttributes() {
    return {
      claimId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-claim-id"),
        renderHTML: (attrs) => (attrs.claimId ? { "data-claim-id": attrs.claimId } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-claim-ref]" }];
  },

  renderHTML({ HTMLAttributes }) {
    // تمثيل HTML ثابت (بلا رقم — الرقم مشتقّ في العرض)
    return ["span", mergeAttributes(HTMLAttributes, { "data-claim-ref": "" }), ""];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ClaimRefView);
  },
});
