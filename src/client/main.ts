import "@xterm/xterm/css/xterm.css";

import { createSessionApi } from "./api/sessionApi";
import { renderInputPromptToast } from "./render/inputPromptToast";
import { renderDashboard } from "./render/renderDashboard";
import { createAnimationFrameScheduler } from "./render/renderScheduler";
import { renderSessionConfigModal } from "./render/sessionConfigModal";
import { renderSessionStatusBar } from "./render/sessionStatusBar";
import { renderTabs, updateActiveTabItem } from "./render/renderTabs";
import { createDashboardStore } from "./state/dashboardStore";
import { createInputPromptRegistry } from "./state/inputPromptRegistry";
import { createSessionSettingsStore } from "./state/sessionSettings";
import { createTabState, type BrowserTab } from "./state/tabState";
import { createTerminalTab } from "./terminal/createTerminalTab";
import { createInactiveTerminalPruner } from "./terminal/inactiveTerminalPruner";
import {
  detectTerminalInputPrompt,
  type TerminalInputPrompt
} from "./terminal/inputPromptDetector";
import { syncTerminalPanelVisibility } from "./terminal/panelVisibility";
import { getCompactPageTitle } from "./pageTitle";
import {
  applyTheme,
  getTheme,
  loadThemeId,
  saveThemeId,
  THEMES,
  type AppTheme
} from "./theme/themeState";
import "./styles.css";

declare const __TMUX_UI_CLIENT_VERSION__: string;

type MountedTerminal = {
  destroy: () => void;
  sendInput: (data: string) => void;
  getVisibleText: () => string;
  clear: () => void;
  redraw: () => void;
  reconnect: () => void;
  scrollPage: (direction: "back" | "forward") => void;
  toggleBrowserScroll: () => boolean;
  isBrowserScrollEnabled: () => boolean;
  setTheme: (theme: AppTheme["terminalTheme"]) => void;
  setFontSize: (fontSize: number) => void;
  setFontFamily: (fontFamily: string) => void;
  setLineHeight: (lineHeight: number) => void;
  panel: HTMLElement;
  statusBar: HTMLElement;
};

const app = document.querySelector<HTMLElement>("#app");

if (!app) {
  throw new Error("App root not found");
}

app.innerHTML = `
  <div class="app-shell">
    <div class="tabs-root"></div>
    <div class="content-root">
      <div class="dashboard-root"></div>
      <div class="panels-root"></div>
    </div>
  </div>
`;

const tabsRoot = app.querySelector<HTMLElement>(".tabs-root")!;
const dashboardRoot = app.querySelector<HTMLElement>(".dashboard-root")!;
const panelsRoot = app.querySelector<HTMLElement>(".panels-root")!;

document.title = getCompactPageTitle(
  window.location.hostname,
  __TMUX_UI_CLIENT_VERSION__
);

let activeTheme = getTheme(loadThemeId());
let draftSessionName = "";
let activeConfigSessionName: string | null = null;
let activeSendSessionName: string | null = null;
let activeSwitchSessionName: string | null = null;
let draftSendTargetName = "";
let draftSendCommand = "";
const tabState = createTabState();
const inputPrompts = createInputPromptRegistry();
const sessionSettings = createSessionSettingsStore();
const store = createDashboardStore({
  api: createSessionApi(),
  pollMs: 10_000,
  pruneTabs: (validSessionNames) => tabState.pruneTabs(validSessionNames),
  shouldIncludePreview: () => tabState.getActiveTabId() === null,
  shouldIncludePanes: () => tabState.getActiveTabId() !== null,
  isActiveSessionBusy: () => {
    const activeTabId = tabState.getActiveTabId();

    return activeTabId !== null && busyTerminalTabIds.has(activeTabId);
  },
  getActiveSessionName: () => {
    const activeTabId = tabState.getActiveTabId();

    return (
      tabState.getTabs().find((tab) => tab.id === activeTabId)?.sessionName ?? null
    );
  }
});
const mountedTerminals = new Map<string, MountedTerminal>();
const inactiveTerminalPruner = createInactiveTerminalPruner({
  delayMs: 5000
});
const activeOutputTimers = new Map<string, ReturnType<typeof setTimeout>>();
const busyTerminalTabIds = new Set<string>();
const terminalPromptSignatures = new Map<string, string>();
const IMAGE_PREVIEW_PATH_STORAGE_KEY = "browser-tmux-dashboard.image-preview-path";
const IMAGE_PATH_PATTERN =
  /(?:~\/|\/|\.{1,2}\/)?[^\s'"<>|]+?\.(?:png|jpe?g|gif|webp|svg|avif|apng)(?:\?[^\s'"<>|]*)?/gi;
let activeImageSessionName: string | null = null;
let imagePreviewScanToken = 0;
let lastRenderedTabListSignature = "";
let lastRenderedActiveTabId: string | null | undefined;
let visibleTerminalPanelId: string | null = null;
let lastDashboardActive = tabState.getActiveTabId() === null;

applyTheme(activeTheme);

const renderScheduler = createAnimationFrameScheduler(render);

function scheduleRender() {
  renderScheduler.schedule();
}

function getOrOpenTab(sessionName: string) {
  const existing = tabState
    .getTabs()
    .find((tab) => tab.sessionName === sessionName);

  if (existing) {
    tabState.setActiveTab(existing.id);
    scheduleRender();
    return existing;
  }

  return tabState.openTab(sessionName);
}

function getTabForSession(sessionName: string) {
  return tabState
    .getTabs()
    .find((tab) => tab.sessionName === sessionName) ?? null;
}

function closeTab(tabId: string, options: { force?: boolean } = {}) {
  clearInputPromptForTab(tabId);
  inactiveTerminalPruner.cancel(tabId);
  mountedTerminals.get(tabId)?.destroy();
  mountedTerminals.get(tabId)?.panel.remove();
  mountedTerminals.delete(tabId);

  if (options.force) {
    tabState.forceCloseTab(tabId);
  } else {
    tabState.closeTab(tabId);
  }

  scheduleRender();
}

function detachTerminal(tabId: string) {
  const mounted = mountedTerminals.get(tabId);
  const outputTimer = activeOutputTimers.get(tabId);

  if (outputTimer) {
    clearTimeout(outputTimer);
    activeOutputTimers.delete(tabId);
  }

  busyTerminalTabIds.delete(tabId);

  if (!mounted) {
    return;
  }

  mounted.destroy();
  mounted.panel.remove();
  mountedTerminals.delete(tabId);

  if (visibleTerminalPanelId === tabId) {
    visibleTerminalPanelId = null;
  }
}

function clearInputPromptForTab(tabId: string) {
  terminalPromptSignatures.delete(tabId);
  inputPrompts.clearTabPrompt(tabId);
}

function rememberTerminalOutput(tabId: string, visibleText: string) {
  const prompt = detectTerminalInputPrompt(visibleText);

  if (!prompt) {
    return;
  }

  const tab = tabState.getTabs().find((item) => item.id === tabId);

  if (!tab) {
    return;
  }

  const signature = `${tab.sessionName}:${prompt.snippet}:${prompt.actions
    .map((action) => action.label)
    .join(",")}`;

  if (terminalPromptSignatures.get(tabId) === signature) {
    return;
  }

  terminalPromptSignatures.set(tabId, signature);
  inputPrompts.setPrompt({
    tabId,
    sessionName: tab.sessionName,
    prompt
  });
  scheduleRender();
}

function rememberSessionInputPrompt(sessionName: string, prompt: TerminalInputPrompt | null) {
  const tab = getTabForSession(sessionName);
  const signatureKey = tab?.id ?? `session:${sessionName}`;

  if (!prompt) {
    terminalPromptSignatures.delete(signatureKey);
    inputPrompts.setPrompt({
      tabId: tab?.id ?? null,
      sessionName,
      prompt: null
    });
    return;
  }

  const signature = `${sessionName}:${prompt.snippet}:${prompt.actions
    .map((action) => action.label)
    .join(",")}`;

  if (terminalPromptSignatures.get(signatureKey) === signature) {
    return;
  }

  terminalPromptSignatures.set(signatureKey, signature);
  inputPrompts.setPrompt({
    tabId: tab?.id ?? null,
    sessionName,
    prompt
  });
}

function rememberSessionInputPrompts() {
  store.getState().sessions.forEach((session) => {
    rememberSessionInputPrompt(session.name, session.inputPrompt ?? null);
  });
}

function handleTerminalOutput(tabId: string, _data: string, visibleText: string) {
  rememberTerminalOutput(tabId, visibleText);
  busyTerminalTabIds.add(tabId);
  const existingTimer = activeOutputTimers.get(tabId);

  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  activeOutputTimers.set(
    tabId,
    setTimeout(() => {
      activeOutputTimers.delete(tabId);
      busyTerminalTabIds.delete(tabId);

      if (tabState.getActiveTabId() !== tabId) {
        return;
      }

      void store.refresh({
        includePreview: false,
        includePanes: true
      });
    }, 1500)
  );
}

function ensureTerminal(tab: BrowserTab) {
  if (mountedTerminals.has(tab.id)) {
    return;
  }

  const panel = document.createElement("div");
  panel.className = "terminal-panel";
  const frame = document.createElement("div");
  frame.className = "terminal-frame";
  panel.append(frame);
  panelsRoot.append(panel);

  const mounted = createTerminalTab({
    container: frame,
    rendererStatusElement: panel,
    tabId: tab.id,
    sessionName: tab.sessionName,
    fontSize: sessionSettings.get(tab.sessionName).fontSize,
    fontFamily: sessionSettings.get(tab.sessionName).fontFamily,
    lineHeight: sessionSettings.get(tab.sessionName).lineHeight,
    terminalTheme: getTheme(sessionSettings.get(tab.sessionName).themeId).terminalTheme,
    onOutput: (data, visibleText) => handleTerminalOutput(tab.id, data, visibleText),
    onClosed: () => {
      closeTab(tab.id, { force: true });
      const isDashboardActive = tabState.getActiveTabId() === null;

      void store.refresh({
        includePreview: isDashboardActive,
        includePanes: !isDashboardActive
      });
    }
  });

  const mountedTerminal: MountedTerminal = {
    destroy: mounted.destroy,
    sendInput: mounted.sendInput,
    getVisibleText: mounted.getVisibleText,
    clear: mounted.clear,
    redraw: mounted.redraw,
    reconnect: mounted.reconnect,
    scrollPage: mounted.scrollPage,
    toggleBrowserScroll: mounted.toggleBrowserScroll,
    isBrowserScrollEnabled: mounted.isBrowserScrollEnabled,
    setTheme: mounted.setTheme,
    setFontSize: mounted.setFontSize,
    setFontFamily: mounted.setFontFamily,
    setLineHeight: mounted.setLineHeight,
    panel,
    statusBar: panel
  };
  mountedTerminals.set(tab.id, mountedTerminal);
  renderSessionStatusBar(
    panel,
    store.getState().sessions.find((session) => session.name === tab.sessionName),
    createSessionStatusActions(tab, mountedTerminal)
  );
  panel.style.background = getTheme(
    sessionSettings.get(tab.sessionName).themeId
  ).terminalTheme.background;
}

function syncTerminalStatusBars() {
  const sessionsByName = new Map(
    store.getState().sessions.map((session) => [session.name, session])
  );

  tabState.getTabs().forEach((tab) => {
    const mounted = mountedTerminals.get(tab.id);

    if (!mounted) {
      return;
    }

    renderSessionStatusBar(
      mounted.panel,
      sessionsByName.get(tab.sessionName),
      createSessionStatusActions(tab, mounted)
    );
  });
}

function syncPanels() {
  const tabs = tabState.getTabs();
  const activeTabId = tabState.getActiveTabId();
  const validIds = new Set(tabs.map((tab) => tab.id));

  [...mountedTerminals.keys()].forEach((tabId) => {
    if (!validIds.has(tabId)) {
      inactiveTerminalPruner.cancel(tabId);
      detachTerminal(tabId);
    }
  });

  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  const nextVisiblePanelId = activeTab?.id ?? null;

  if (activeTab) {
    ensureTerminal(activeTab);
  }

  visibleTerminalPanelId = syncTerminalPanelVisibility(
    mountedTerminals,
    visibleTerminalPanelId,
    nextVisiblePanelId
  );
  inactiveTerminalPruner.sync(
    activeTabId,
    [...mountedTerminals.keys()],
    detachTerminal
  );
  syncTerminalStatusBars();
}

function setActiveTheme(themeId: string) {
  activeTheme = getTheme(themeId);
  applyTheme(activeTheme);
  saveThemeId(activeTheme.id);

  scheduleRender();
}

function setSessionFontSize(sessionName: string, fontSize: number) {
  const nextSettings = sessionSettings.setFontSize(sessionName, fontSize);

  tabState
    .getTabs()
    .filter((tab) => tab.sessionName === sessionName)
    .forEach((tab) => {
      mountedTerminals.get(tab.id)?.setFontSize(nextSettings.fontSize);
    });

  scheduleRender();
}

function setSessionFontFamily(sessionName: string, fontFamily: string) {
  const nextSettings = sessionSettings.setFontFamily(sessionName, fontFamily);

  tabState
    .getTabs()
    .filter((tab) => tab.sessionName === sessionName)
    .forEach((tab) => {
      mountedTerminals.get(tab.id)?.setFontFamily(nextSettings.fontFamily);
    });

  scheduleRender();
}

function setSessionLineHeight(sessionName: string, lineHeight: number) {
  const nextSettings = sessionSettings.setLineHeight(sessionName, lineHeight);

  tabState
    .getTabs()
    .filter((tab) => tab.sessionName === sessionName)
    .forEach((tab) => {
      mountedTerminals.get(tab.id)?.setLineHeight(nextSettings.lineHeight);
    });

  scheduleRender();
}

function setSessionTheme(sessionName: string, themeId: string) {
  const nextSettings = sessionSettings.setThemeId(sessionName, themeId);
  const theme = getTheme(nextSettings.themeId);

  tabState
    .getTabs()
    .filter((tab) => tab.sessionName === sessionName)
    .forEach((tab) => {
      const mounted = mountedTerminals.get(tab.id);
      mounted?.setTheme(theme.terminalTheme);

      if (mounted) {
        mounted.panel.style.background = theme.terminalTheme.background;
      }
    });

  scheduleRender();
}

async function renameSession(fromName: string, toName: string) {
  tabState.renameSession(fromName, toName);
  sessionSettings.renameSession(fromName, toName);

  if (activeConfigSessionName === fromName) {
    activeConfigSessionName = toName;
  }

  await store.renameSession(fromName, toName);
  scheduleRender();
}

function promptRenameSession(sessionName: string) {
  const nextName = window.prompt("Rename session", sessionName)?.trim();

  if (!nextName || nextName === sessionName) {
    return;
  }

  void renameSession(sessionName, nextName);
}

function closeTabsForSession(sessionName: string) {
  tabState
    .getTabs()
    .filter((tab) => tab.sessionName === sessionName)
    .forEach((tab) => closeTab(tab.id, { force: true }));
}

function killSession(sessionName: string, options: { confirm?: boolean } = {}) {
  if (options.confirm) {
    const confirmed = window.confirm(`Kill tmux session "${sessionName}"?`);

    if (!confirmed) {
      return;
    }
  }

  if (activeConfigSessionName === sessionName) {
    activeConfigSessionName = null;
  }

  closeTabsForSession(sessionName);
  void store.killSession(sessionName).then(() => {
    scheduleRender();
  });
}

function getSessionNames() {
  return store.getState().sessions.map((session) => session.name);
}

function switchToSession(sessionName: string) {
  getOrOpenTab(sessionName);
  activeSwitchSessionName = null;
  scheduleRender();
}

function openSwitchSessionPanel(currentSessionName: string) {
  activeSwitchSessionName = currentSessionName;
  scheduleRender();
}

function closeSwitchSessionPanel() {
  activeSwitchSessionName = null;
  scheduleRender();
}

function getSessionCurrentPath(sessionName: string) {
  return (
    store
      .getState()
      .sessions.find((session) => session.name === sessionName)?.currentPath ?? ""
  );
}

function getImagePreviewUrl(imagePath: string, basePath: string) {
  const params = new URLSearchParams({ path: imagePath });

  if (basePath) {
    params.set("basePath", basePath);
  }

  return `/api/image-preview?${params.toString()}`;
}

function getImagePreviewInfoUrl(imagePath: string, basePath: string) {
  const params = new URLSearchParams({ path: imagePath });

  if (basePath) {
    params.set("basePath", basePath);
  }

  return `/api/image-preview-info?${params.toString()}`;
}

function getStoredImagePreviewPath() {
  try {
    return window.localStorage.getItem(IMAGE_PREVIEW_PATH_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeImagePreviewPath(imagePath: string) {
  try {
    window.localStorage.setItem(IMAGE_PREVIEW_PATH_STORAGE_KEY, imagePath);
  } catch {
    // Ignore storage failures; preview still works for the current click.
  }
}

function normalizeImagePathCandidate(value: string) {
  return value.replace(/[),.;:]+$/g, "");
}

function getVisibleImagePaths(tab: BrowserTab) {
  const visibleText = mountedTerminals.get(tab.id)?.getVisibleText() ?? "";
  const paths = new Set<string>();
  let match: RegExpExecArray | null;

  IMAGE_PATH_PATTERN.lastIndex = 0;

  while ((match = IMAGE_PATH_PATTERN.exec(visibleText))) {
    const candidate = normalizeImagePathCandidate(match[0] ?? "");

    if (candidate) {
      paths.add(candidate);
    }
  }

  const storedPath = getStoredImagePreviewPath();

  if (storedPath) {
    paths.add(storedPath);
  }

  return [...paths];
}

function openImagePreviewPanel(sessionName: string) {
  activeImageSessionName = sessionName;
  scheduleRender();
}

function closeImagePreviewPanel() {
  activeImageSessionName = null;
  imagePreviewScanToken += 1;
  scheduleRender();
}

async function verifyImagePath(imagePath: string, basePath: string) {
  try {
    const response = await fetch(getImagePreviewInfoUrl(imagePath, basePath));

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as {
      ok: true;
      path: string;
      contentType: string;
      size: number;
    };
  } catch {
    return null;
  }
}

function formatImageSize(size: number) {
  if (size < 1024) {
    return `${size}B`;
  }

  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)}KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)}MB`;
}

function resetPreviewImage(
  panel: HTMLElement,
  image: HTMLImageElement,
  error: HTMLElement
) {
  panel.classList.add("is-compact");
  panel.classList.remove("has-image");
  image.removeAttribute("src");
  image.alt = "";
  error.hidden = true;
}

function setPreviewImage(
  panel: HTMLElement,
  image: HTMLImageElement,
  error: HTMLElement,
  sessionName: string,
  imagePath: string
) {
  const basePath = getSessionCurrentPath(sessionName);
  const imageUrl = getImagePreviewUrl(imagePath, basePath);

  storeImagePreviewPath(imagePath);
  panel.classList.remove("is-compact");
  panel.classList.add("has-image");
  error.hidden = true;
  image.src = imageUrl;
  image.alt = imagePath;
}

async function loadPreviewImage(
  panel: HTMLElement,
  image: HTMLImageElement,
  error: HTMLElement,
  status: HTMLElement,
  input: HTMLInputElement,
  sessionName: string,
  imagePath: string
) {
  const basePath = getSessionCurrentPath(sessionName);
  status.hidden = false;
  status.textContent = "Checking image";

  const info = await verifyImagePath(imagePath, basePath);

  if (!info) {
    resetPreviewImage(panel, image, error);
    status.textContent = "Image not found or not allowed";
    return null;
  }

  input.value = info.path;
  status.hidden = true;
  setPreviewImage(panel, image, error, sessionName, info.path);

  return info;
}

function renderImagePreviewPanel() {
  panelsRoot.querySelector(".image-preview-backdrop")?.remove();

  if (!activeImageSessionName) {
    return;
  }

  const tab = tabState
    .getTabs()
    .find((item) => item.sessionName === activeImageSessionName);
  const mounted = tab ? mountedTerminals.get(tab.id) : null;

  if (!tab || !mounted) {
    activeImageSessionName = null;
    return;
  }

  const detectedPaths = getVisibleImagePaths(tab);
  const defaultPath = detectedPaths[0] ?? getStoredImagePreviewPath() ?? "";

  const backdrop = document.createElement("div");
  backdrop.className = "image-preview-backdrop";
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      closeImagePreviewPanel();
    }
  });

  const panel = document.createElement("section");
  panel.className = "image-preview-panel is-compact";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "Image preview");

  const header = document.createElement("div");
  header.className = "image-preview-header";

  const form = document.createElement("form");
  form.className = "image-preview-form";

  const input = document.createElement("input");
  input.name = "image-path";
  input.value = defaultPath;
  input.placeholder = "image path";

  const viewButton = document.createElement("button");
  viewButton.type = "submit";
  viewButton.textContent = "View";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "Close";
  closeButton.addEventListener("click", closeImagePreviewPanel);

  form.append(input, viewButton);

  const actions = document.createElement("div");
  actions.className = "image-preview-actions";
  actions.append(closeButton);
  header.append(form, actions);

  const candidateList = document.createElement("div");
  candidateList.className = "image-preview-candidates";
  candidateList.setAttribute("aria-label", "Detected image paths");

  const scanToken = (imagePreviewScanToken += 1);
  const basePath = getSessionCurrentPath(tab.sessionName);
  let autoPreviewed = false;

  const loading = document.createElement("span");
  loading.textContent = detectedPaths.length > 0
    ? `Checking ${detectedPaths.length} image path${detectedPaths.length === 1 ? "" : "s"}`
    : "No image paths in visible terminal output";
  candidateList.append(loading);

  const manualStatus = document.createElement("span");
  manualStatus.className = "image-preview-status";
  manualStatus.hidden = true;
  candidateList.append(manualStatus);

  detectedPaths.forEach((imagePath) => {
    void verifyImagePath(imagePath, basePath).then((info) => {
      if (scanToken !== imagePreviewScanToken || !info) {
        return;
      }

      if (loading.isConnected) {
        loading.remove();
      }

      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${info.path} · ${formatImageSize(info.size)}`;
      button.title = info.path;
      button.addEventListener("click", () => {
        input.value = info.path;
        setPreviewImage(panel, image, error, tab.sessionName, info.path);
      });
      candidateList.append(button);

      if (!autoPreviewed) {
        autoPreviewed = true;
        input.value = info.path;
        setPreviewImage(panel, image, error, tab.sessionName, info.path);
      }
    });
  });

  if (detectedPaths.length > 0) {
    queueMicrotask(() => {
      window.setTimeout(() => {
        if (
          scanToken === imagePreviewScanToken &&
          candidateList.querySelectorAll("button").length === 0
        ) {
          loading.textContent = `Found 0 real image files from ${detectedPaths.length} candidate${detectedPaths.length === 1 ? "" : "s"}`;
        }
      }, 800);
    });
  }
  const body = document.createElement("div");
  body.className = "image-preview-body";

  const error = document.createElement("div");
  error.className = "image-preview-error";
  error.textContent = "Image failed to load";
  error.hidden = true;

  const image = document.createElement("img");
  image.className = "image-preview-image";
  image.addEventListener("error", () => {
    error.hidden = false;
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const imagePath = input.value.trim();

    if (imagePath) {
      void loadPreviewImage(
        panel,
        image,
        error,
        manualStatus,
        input,
        tab.sessionName,
        imagePath
      );
    }
  });

  body.append(image, error);
  panel.append(header, candidateList, body);
  backdrop.append(panel);
  mounted.panel.append(backdrop);

  input.focus();
  input.select();
}

function openSendCommandPanel(currentSessionName: string) {
  const sessionNames = getSessionNames();

  activeSendSessionName = currentSessionName;
  draftSendTargetName =
    sessionNames.find((name) => name !== currentSessionName) ?? currentSessionName;
  draftSendCommand = "";
  scheduleRender();
}

function closeSendCommandPanel() {
  activeSendSessionName = null;
  draftSendTargetName = "";
  draftSendCommand = "";
  scheduleRender();
}

function renderSendCommandPanel() {
  panelsRoot.querySelector(".send-command-backdrop")?.remove();

  if (!activeSendSessionName) {
    return;
  }

  const sessionNames = getSessionNames();

  if (!sessionNames.includes(draftSendTargetName)) {
    draftSendTargetName =
      sessionNames.find((name) => name !== activeSendSessionName) ??
      activeSendSessionName;
  }

  const backdrop = document.createElement("div");
  backdrop.className = "send-command-backdrop";
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      closeSendCommandPanel();
    }
  });

  const panel = document.createElement("section");
  panel.className = "send-command-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");

  const header = document.createElement("div");
  header.className = "send-command-header";

  const title = document.createElement("h2");
  title.textContent = "Send command";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "Close";
  closeButton.addEventListener("click", closeSendCommandPanel);

  header.append(title, closeButton);

  const targetList = document.createElement("div");
  targetList.className = "send-command-targets";
  targetList.setAttribute("aria-label", "Target session");

  sessionNames.forEach((sessionName) => {
    const targetButton = document.createElement("button");
    targetButton.type = "button";
    targetButton.textContent = sessionName;
    targetButton.className =
      sessionName === draftSendTargetName ? "is-selected" : "";
    targetButton.addEventListener("click", () => {
      draftSendTargetName = sessionName;
      scheduleRender();
    });
    targetList.append(targetButton);
  });

  const form = document.createElement("form");
  form.className = "send-command-form";

  const input = document.createElement("input");
  input.name = "send-command";
  input.placeholder = "command";
  input.value = draftSendCommand;
  input.addEventListener("input", () => {
    draftSendCommand = input.value;
  });

  const sendButton = document.createElement("button");
  sendButton.type = "submit";
  sendButton.textContent = "Send";

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const command = draftSendCommand.trim();

    if (!draftSendTargetName || !command) {
      return;
    }

    void store.sendCommand(draftSendTargetName, command);
    closeSendCommandPanel();
  });

  form.append(input, sendButton);
  panel.append(header, targetList, form);
  backdrop.append(panel);
  panelsRoot.append(backdrop);
  input.focus();
}

function renderSwitchSessionPanel() {
  panelsRoot.querySelector(".switch-session-backdrop")?.remove();

  if (!activeSwitchSessionName) {
    return;
  }

  const sessions = store.getState().sessions;
  const backdrop = document.createElement("div");
  backdrop.className = "send-command-backdrop switch-session-backdrop";
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      closeSwitchSessionPanel();
    }
  });

  const panel = document.createElement("section");
  panel.className = "send-command-panel switch-session-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "Switch session");

  const header = document.createElement("div");
  header.className = "send-command-header";

  const title = document.createElement("h2");
  title.textContent = "Switch session";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "Close";
  closeButton.addEventListener("click", closeSwitchSessionPanel);

  header.append(title, closeButton);

  const sessionList = document.createElement("div");
  sessionList.className = "send-command-targets switch-session-targets";
  sessionList.setAttribute("aria-label", "Sessions");

  sessions.forEach((session) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className =
      session.name === activeSwitchSessionName ? "is-selected" : "";
    button.textContent = session.name;
    button.title = [
      session.name,
      session.currentPath,
      session.currentCommand
    ].filter(Boolean).join(" · ");
    button.addEventListener("click", () => switchToSession(session.name));
    sessionList.append(button);
  });

  panel.append(header, sessionList);
  backdrop.append(panel);
  panelsRoot.append(backdrop);
  sessionList.querySelector<HTMLButtonElement>("button")?.focus();
}

function closeInputPrompt(key: string) {
  inputPrompts.clearPrompt(key);
  scheduleRender();
}

function sendInputPromptAction(key: string, input: string) {
  const prompt = inputPrompts.getPrompt(key);

  if (!prompt) {
    return;
  }

  const tab = tabState
    .getTabs()
    .find((item) =>
      prompt.tabId
        ? item.id === prompt.tabId
        : item.sessionName === prompt.sessionName
    ) ?? getOrOpenTab(prompt.sessionName);

  tabState.setActiveTab(tab.id);
  ensureTerminal(tab);

  mountedTerminals.get(tab.id)?.sendInput(input);
  closeInputPrompt(key);
}

function openInputPromptTab(key: string) {
  const prompt = inputPrompts.getPrompt(key);

  if (!prompt) {
    return;
  }

  const tab =
    prompt.tabId
      ? tabState.getTabs().find((item) => item.id === prompt.tabId)
      : getOrOpenTab(prompt.sessionName);

  if (tab) {
    tabState.setActiveTab(tab.id);
  }

  scheduleRender();
}

function splitPane(sessionName: string, direction: "horizontal" | "vertical") {
  void store.splitPane(sessionName, direction).then(() => {
    scheduleRender();
  });
}

function openSessionPane(sessionName: string, paneId: string) {
  void store.selectPane(sessionName, paneId).then(() => {
    getOrOpenTab(sessionName);
    scheduleRender();
  });
}

function selectPane(sessionName: string, paneId: string) {
  void store.selectPane(sessionName, paneId).then(() => {
    void store.refresh({ includePreview: false, includePanes: true });
    scheduleRender();
  });
}

function killPane(sessionName: string, paneId: string) {
  const confirmed = window.confirm(`Close pane ${paneId} in "${sessionName}"?`);

  if (!confirmed) {
    return;
  }

  void store.killPane(sessionName, paneId).then(() => {
    scheduleRender();
  });
}

function refreshDashboard(options: { includeServerStatus?: boolean } = {}) {
  void store
    .refresh({
      includePreview: true,
      includePanes: true,
      includeServerStatus: options.includeServerStatus ?? false
    })
    .then(() => {
      scheduleRender();
    });
}

function createSessionStatusActions(tab: BrowserTab, mounted: MountedTerminal) {
  return {
    onRefresh: () => {
      const isDashboardActive = tabState.getActiveTabId() === null;

      void store.refresh({
        includePreview: isDashboardActive,
        includePanes: !isDashboardActive
      });
    },
    onClear: () => {
      mounted.clear();
    },
    onRedraw: () => {
      mounted.redraw();
    },
    onReconnect: () => {
      mounted.reconnect();
    },
    onScrollHistoryBack: () => {
      mounted.scrollPage("back");
    },
    onScrollHistoryForward: () => {
      mounted.scrollPage("forward");
    },
    onToggleBrowserScroll: () => {
      mounted.toggleBrowserScroll();
      syncTerminalStatusBars();
    },
    browserScrollEnabled: mounted.isBrowserScrollEnabled(),
    onConfig: () => {
      activeConfigSessionName = tab.sessionName;
      scheduleRender();
    },
    onRename: () => promptRenameSession(tab.sessionName),
    onSendCommand: () => openSendCommandPanel(tab.sessionName),
    onSwitchSession: () => openSwitchSessionPanel(tab.sessionName),
    onPreviewImage: () => openImagePreviewPanel(tab.sessionName),
    onSplitHorizontal: () => splitPane(tab.sessionName, "horizontal"),
    onSplitVertical: () => splitPane(tab.sessionName, "vertical"),
    onSelectPane: selectPane,
    onKillPane: killPane,
    onKill: () => killSession(tab.sessionName, { confirm: true })
  };
}

function render() {
  rememberSessionInputPrompts();
  const tabs = tabState.getTabs();
  const activeTabId = tabState.getActiveTabId();
  const isDashboardActive = activeTabId === null;
  const tabListSignature = tabs
    .map((tab) => `${tab.id}:${tab.title}:${tab.pinned ? "pinned" : "free"}`)
    .join("|");

  if (tabListSignature !== lastRenderedTabListSignature) {
    renderTabs(tabsRoot, tabs, activeTabId, {
      onSelectTab: (tabId) => {
        tabState.setActiveTab(tabId === "__dashboard__" ? null : tabId);
        scheduleRender();
      },
      onCloseTab: (tabId) => closeTab(tabId),
      onTogglePin: (tabId) => {
        tabState.togglePinned(tabId);
        scheduleRender();
      }
    });
    lastRenderedTabListSignature = tabListSignature;
    lastRenderedActiveTabId = activeTabId;
  } else if (activeTabId !== lastRenderedActiveTabId) {
    updateActiveTabItem(tabsRoot, activeTabId);
    lastRenderedActiveTabId = activeTabId;
  }

  if (isDashboardActive !== lastDashboardActive) {
    lastDashboardActive = isDashboardActive;

    if (isDashboardActive) {
      refreshDashboard();
    }
  }

  if (activeTabId === null) {
    renderDashboard(dashboardRoot, store.getState(), {
      onCreateSession: (name) => {
        void store.createSession(name).then(() => {
          getOrOpenTab(name);
          scheduleRender();
        });
      },
      onOpenSession: (name) => {
        getOrOpenTab(name);
        scheduleRender();
      },
      onOpenSessionPane: openSessionPane,
      onKillSession: (name) => {
        killSession(name);
      },
      onRenameSession: (fromName, toName) => {
        void renameSession(fromName, toName);
      },
      getSessionSettings: (name) => sessionSettings.get(name),
      onSessionFontSizeChange: setSessionFontSize,
      onSessionFontFamilyChange: setSessionFontFamily,
      onSessionLineHeightChange: setSessionLineHeight,
      onSessionThemeChange: setSessionTheme,
      activeConfigSessionName,
      onOpenSessionConfig: (name) => {
        activeConfigSessionName = name;
        scheduleRender();
      },
      onCloseSessionConfig: () => {
        activeConfigSessionName = null;
        scheduleRender();
      },
      draftSessionName,
      onDraftChange: (value) => {
        draftSessionName = value;
      },
      themes: THEMES,
      activeThemeId: activeTheme.id,
      onThemeChange: setActiveTheme,
      onRefreshDashboard: () => refreshDashboard({ includeServerStatus: true }),
      browserTabs: tabs.map((tab) => ({
        sessionName: tab.sessionName,
        active: tab.id === activeTabId
      }))
    });
  }

  dashboardRoot.style.display = activeTabId === null ? "block" : "none";
  panelsRoot.style.display = activeTabId === null ? "none" : "block";
  syncPanels();
  panelsRoot.querySelector(".session-config-backdrop")?.remove();
  renderImagePreviewPanel();
  renderSendCommandPanel();
  renderSwitchSessionPanel();
  renderInputPromptToast(app, inputPrompts.getPrompts(), {
    onDismiss: closeInputPrompt,
    onOpen: openInputPromptTab,
    onSend: sendInputPromptAction
  });

  if (activeTabId !== null && activeConfigSessionName) {
    const activeSession = store
      .getState()
      .sessions.find((session) => session.name === activeConfigSessionName);

    if (activeSession) {
      panelsRoot.append(
        renderSessionConfigModal(activeSession.name, {
          getSessionSettings: (name) => sessionSettings.get(name),
          onSessionFontSizeChange: setSessionFontSize,
          onSessionFontFamilyChange: setSessionFontFamily,
          onSessionLineHeightChange: setSessionLineHeight,
          onSessionThemeChange: setSessionTheme,
          onCloseSessionConfig: () => {
            activeConfigSessionName = null;
            scheduleRender();
          },
          themes: THEMES
        })
      );
    }
  }
}

store.subscribe(() => {
  scheduleRender();
});

{
  const isDashboardActive = tabState.getActiveTabId() === null;

  void store
    .refresh({
      includePreview: isDashboardActive,
      includePanes: !isDashboardActive
    })
    .then(() => {
      scheduleRender();
      store.startPolling();
    });
}
