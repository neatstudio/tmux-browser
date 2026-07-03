export type LayoutMode = "none";
export type AppView = "terminal" | "kanban";
export type ViewUrlOptions = {
  view: AppView;
  projectName?: string | null;
};

export function getLayoutMode(search = window.location.search): LayoutMode {
  void search;

  return "none";
}

export function getAppView(search = window.location.search): AppView {
  return getRequestedAppView(search) ?? "kanban";
}

export function getRequestedAppView(search = window.location.search): AppView | null {
  const params = new URLSearchParams(search);

  if (params.get("view") === "kanban") {
    return "kanban";
  }

  if (params.get("view") === "terminal") {
    return "terminal";
  }

  return null;
}

export function shouldRenderSidebar(layoutMode: LayoutMode, appView: AppView) {
  void layoutMode;
  void appView;

  return false;
}

export function getAppShellClasses(layoutMode: LayoutMode, appView: AppView) {
  const classes = ["app-shell"];

  void layoutMode;

  if (appView === "kanban") {
    classes.push("app-shell--kanban-view");
  }

  return classes.join(" ");
}

export function getInitialAppView(
  requestedAppView: AppView | null,
  activeTabId: string | null
): AppView {
  if (requestedAppView) {
    return requestedAppView;
  }

  if (activeTabId !== null) {
    return "terminal";
  }

  return "kanban";
}

export function shouldPromoteActiveTabToTerminal(
  appView: AppView,
  activeTabId: string | null,
  requestedAppView: AppView | null
) {
  return (
    activeTabId !== null &&
    appView !== "terminal" &&
    requestedAppView !== "kanban"
  );
}

export function buildViewUrl(href: string, options: ViewUrlOptions) {
  const url = new URL(href);
  url.searchParams.delete("layout");

  if (options.view === "terminal") {
    url.searchParams.set("view", "terminal");
  } else {
    url.searchParams.set("view", "kanban");
  }

  if (options.projectName && options.view === "kanban") {
    url.searchParams.set("project", options.projectName);
  } else {
    url.searchParams.delete("project");
  }

  return `${url.pathname}${url.search}${url.hash}`;
}
