export type LayoutMode = "tabs" | "sidebar";
export type AppView = "terminal" | "kanban";

export function getLayoutMode(search = window.location.search): LayoutMode {
  const params = new URLSearchParams(search);

  return params.get("layout") === "tabs" ? "tabs" : "sidebar";
}

export function getAppView(search = window.location.search): AppView {
  const params = new URLSearchParams(search);

  return params.get("view") === "kanban" ? "kanban" : "terminal";
}
