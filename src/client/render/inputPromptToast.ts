import type { InputPromptNotice } from "../state/inputPromptRegistry";

export type InputPromptToastActions = {
  onDismiss: (key: string) => void;
  onOpen: (key: string) => void;
  onSend: (key: string, input: string) => void;
};

export function renderInputPromptToast(
  root: HTMLElement,
  prompts: InputPromptNotice[],
  handlers: InputPromptToastActions
) {
  root.querySelector(".input-prompt-toast")?.remove();

  if (prompts.length === 0) {
    return;
  }

  const toast = document.createElement("section");
  toast.className = "input-prompt-toast";
  toast.setAttribute("role", "dialog");
  toast.setAttribute("aria-live", "assertive");
  toast.setAttribute("aria-label", "Terminals waiting for input");

  prompts.forEach((prompt) => {
    const card = document.createElement("article");
    card.className = "input-prompt-card";
    card.dataset.promptKey = prompt.key;

    const header = document.createElement("div");
    header.className = "input-prompt-header";

    const title = document.createElement("strong");
    title.textContent = `${prompt.sessionName} waiting`;

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "input-prompt-close";
    closeButton.textContent = "×";
    closeButton.setAttribute("aria-label", `Dismiss ${prompt.sessionName} prompt`);
    closeButton.addEventListener("click", () => handlers.onDismiss(prompt.key));

    header.append(title, closeButton);

    const snippet = document.createElement("pre");
    snippet.className = "input-prompt-snippet";
    snippet.textContent = prompt.prompt.snippet;

    const actions = document.createElement("div");
    actions.className = "input-prompt-actions";

    prompt.prompt.actions.forEach((action) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = action.label;
      button.addEventListener("click", () => {
        handlers.onSend(prompt.key, action.input);
      });
      actions.append(button);
    });

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.textContent = "Open";
    openButton.addEventListener("click", () => handlers.onOpen(prompt.key));
    actions.append(openButton);

    card.append(header, snippet, actions);
    toast.append(card);
  });

  root.append(toast);
}
