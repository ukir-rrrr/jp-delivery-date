export type ExtensionStatus = "unknown" | "active" | "inactive";

export interface ThemeExtensionState {
  cartBlock: ExtensionStatus;
  cartEmbed: ExtensionStatus;
}

const CART_BLOCK_HANDLE = "cart-delivery";
const CART_EMBED_HANDLE = "cart-drawer-embed";

function blockStatus(
  extensions: Awaited<ReturnType<typeof shopify.app.extensions>>,
  blockHandle: string,
): ExtensionStatus {
  for (const ext of extensions) {
    for (const block of ext.activations) {
      if (!("handle" in block) || !("status" in block)) continue;
      if (block.handle !== blockHandle) continue;
      return block.status === "active" ? "active" : "inactive";
    }
  }
  return "inactive";
}

export async function detectThemeExtensions(): Promise<ThemeExtensionState> {
  const unknown: ThemeExtensionState = {
    cartBlock: "unknown",
    cartEmbed: "unknown",
  };
  try {
    if (typeof shopify === "undefined" || !shopify.app?.extensions) {
      return unknown;
    }
    const extensions = await shopify.app.extensions();
    return {
      cartBlock: blockStatus(extensions, CART_BLOCK_HANDLE),
      cartEmbed: blockStatus(extensions, CART_EMBED_HANDLE),
    };
  } catch {
    return unknown;
  }
}
