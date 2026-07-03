import type { ResponsiveUiTier } from "./responsiveUiTier";

function shouldAvoidKeyboard(tier: ResponsiveUiTier) {
  return tier === "phone" || tier === "pad";
}

export function applyImagePreviewOpenFocus(tier: ResponsiveUiTier) {
  if (!shouldAvoidKeyboard(tier)) {
    return;
  }

  const active = document.activeElement;

  if (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    active instanceof HTMLSelectElement ||
    (active instanceof HTMLElement && active.isContentEditable)
  ) {
    active.blur();
  }
}

export function focusImagePreviewPathInput(
  input: HTMLInputElement,
  tier: ResponsiveUiTier
) {
  if (shouldAvoidKeyboard(tier)) {
    return;
  }

  input.focus();
  input.select();
}
