export type ResponsiveUiTier = "desktop" | "pad" | "phone";

export function createViewportWidthChangeHandler(
  getWidth: () => number,
  onWidthChange: () => void
) {
  let previousWidth = getWidth();

  return () => {
    const nextWidth = getWidth();
    if (nextWidth === previousWidth) {
      return;
    }

    previousWidth = nextWidth;
    onWidthChange();
  };
}

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
