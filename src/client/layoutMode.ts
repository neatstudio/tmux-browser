export type LayoutMode = "tabs" | "sidebar";
export type AppView = "terminal" | "kanban";
export type ViewUrlOptions = {
  view: AppView;
  projectName?: string | null;
};

export function getLayoutMode(search = window.location.search): LayoutMode {
  const params = new URLSearchParams(search);

  return params.get("layout") === "tabs" ? "tabs" : "sidebar";
}

export function getAppView(search = window.location.search): AppView {
  const params = new URLSearchParams(search);

  return params.get("view") === "terminal" ? "terminal" : "kanban";
}

export function buildViewUrl(href: string, options: ViewUrlOptions) {
  const url = new URL(href);

  if (options.view === "terminal") {
    url.searchParams.set("view", "terminal");
  } else {
    url.searchParams.delete("view");
  }

  if (options.projectName && options.view === "kanban") {
    url.searchParams.set("project", options.projectName);
  } else {
    url.searchParams.delete("project");
  }

  return `${url.pathname}${url.search}${url.hash}`;
}
