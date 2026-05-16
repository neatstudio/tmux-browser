import {
  FONT_FAMILY_OPTIONS,
  type SessionSettings
} from "../state/sessionSettings";
import type { AppTheme } from "../theme/themeState";

export type SessionConfigModalActions = {
  getSessionSettings: (name: string) => SessionSettings;
  onSessionFontSizeChange: (name: string, fontSize: number) => void;
  onSessionFontFamilyChange: (name: string, fontFamily: string) => void;
  onSessionLineHeightChange: (name: string, lineHeight: number) => void;
  onSessionThemeChange: (name: string, themeId: string) => void;
  onCloseSessionConfig: () => void;
  themes: AppTheme[];
};

function preventWheelNumberChange(input: HTMLInputElement) {
  input.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      input.blur();
    },
    { passive: false }
  );
}

export function renderSessionConfigModal(
  sessionName: string,
  actions: SessionConfigModalActions
) {
  const sessionSettings = actions.getSessionSettings(sessionName);
  const backdrop = document.createElement("div");
  backdrop.className = "session-config-backdrop";
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      actions.onCloseSessionConfig();
    }
  });

  const modal = document.createElement("section");
  modal.className = "session-config-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "session-config-title");

  const modalHeader = document.createElement("div");
  modalHeader.className = "session-config-modal-header";

  const modalTitle = document.createElement("h2");
  modalTitle.id = "session-config-title";
  modalTitle.textContent = sessionName;

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "session-config-close";
  closeButton.textContent = "Close";
  closeButton.addEventListener("click", actions.onCloseSessionConfig);

  modalHeader.append(modalTitle, closeButton);

  const fontField = document.createElement("label");
  fontField.className = "session-config-field";
  fontField.textContent = "Font size";

  const fontSizeInput = document.createElement("input");
  fontSizeInput.type = "number";
  fontSizeInput.name = `fontSize-${sessionName}`;
  fontSizeInput.min = "10";
  fontSizeInput.max = "24";
  fontSizeInput.step = "1";
  fontSizeInput.value = String(sessionSettings.fontSize);
  preventWheelNumberChange(fontSizeInput);
  fontSizeInput.addEventListener("change", () => {
    actions.onSessionFontSizeChange(sessionName, Number(fontSizeInput.value));
  });
  fontField.append(fontSizeInput);

  const fontFamilyField = document.createElement("label");
  fontFamilyField.className = "session-config-field";
  fontFamilyField.textContent = "Font family";

  const fontFamilySelect = document.createElement("select");
  fontFamilySelect.name = `fontFamily-${sessionName}`;
  FONT_FAMILY_OPTIONS.forEach((fontFamily) => {
    const option = document.createElement("option");
    option.value = fontFamily;
    option.textContent = fontFamily;
    fontFamilySelect.append(option);
  });
  fontFamilySelect.value = sessionSettings.fontFamily;
  fontFamilySelect.addEventListener("change", () => {
    actions.onSessionFontFamilyChange(sessionName, fontFamilySelect.value);
  });
  fontFamilyField.append(fontFamilySelect);

  const lineHeightField = document.createElement("label");
  lineHeightField.className = "session-config-field";
  lineHeightField.textContent = "Line height";

  const lineHeightInput = document.createElement("input");
  lineHeightInput.type = "number";
  lineHeightInput.name = `lineHeight-${sessionName}`;
  lineHeightInput.min = "1";
  lineHeightInput.max = "1.8";
  lineHeightInput.step = "0.05";
  lineHeightInput.value = String(sessionSettings.lineHeight);
  preventWheelNumberChange(lineHeightInput);
  lineHeightInput.addEventListener("change", () => {
    actions.onSessionLineHeightChange(sessionName, Number(lineHeightInput.value));
  });
  lineHeightField.append(lineHeightInput);

  const themeGroup = document.createElement("div");
  themeGroup.className = "session-config-field";

  const themeTitle = document.createElement("div");
  themeTitle.className = "session-config-field-title";
  themeTitle.textContent = "Terminal theme";

  const sessionThemeList = document.createElement("div");
  sessionThemeList.className = "session-theme-list";

  actions.themes.forEach((theme) => {
    const swatchButton = document.createElement("button");
    swatchButton.type = "button";
    swatchButton.className = `session-theme-swatch${
      theme.id === sessionSettings.themeId ? " is-active" : ""
    }`;
    swatchButton.title = theme.label;
    swatchButton.setAttribute("aria-label", `${sessionName} ${theme.label}`);
    swatchButton.setAttribute(
      "aria-pressed",
      theme.id === sessionSettings.themeId ? "true" : "false"
    );
    swatchButton.addEventListener("click", () =>
      actions.onSessionThemeChange(sessionName, theme.id)
    );

    theme.swatches.forEach((color) => {
      const colorChip = document.createElement("span");
      colorChip.style.background = color;
      swatchButton.append(colorChip);
    });

    sessionThemeList.append(swatchButton);
  });

  themeGroup.append(themeTitle, sessionThemeList);
  modal.append(modalHeader, fontField, fontFamilyField, lineHeightField, themeGroup);
  backdrop.append(modal);

  return backdrop;
}
