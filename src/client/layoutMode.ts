export type LayoutMode = "tabs" | "sidebar";

export function getLayoutMode(search = window.location.search): LayoutMode {
  const params = new URLSearchParams(search);

  return params.get("layout") === "tabs" ? "tabs" : "sidebar";
}
