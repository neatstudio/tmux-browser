export type ResponsiveUiTier = "desktop" | "pad" | "phone";

export function getResponsiveUiTier(
  width: number
): ResponsiveUiTier {
  if (width < 768) {
    return "phone";
  }

  if (width < 1200) {
    return "pad";
  }

  return "desktop";
}
