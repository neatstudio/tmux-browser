import type { TerminalInputPrompt } from "../../shared/inputPromptDetector";

export type InputPromptNotice = {
  key: string;
  tabId: string | null;
  sessionName: string;
  prompt: TerminalInputPrompt;
  signature: string;
};

type SetPromptInput = {
  tabId: string | null;
  sessionName: string;
  prompt: TerminalInputPrompt | null;
};

function getPromptKey(tabId: string | null, sessionName: string) {
  return tabId ? `tab:${tabId}` : `session:${sessionName}`;
}

function getPromptSignature(sessionName: string, prompt: TerminalInputPrompt) {
  return `${sessionName}:${prompt.snippet}:${prompt.actions
    .map((action) => action.label)
    .join(",")}`;
}

export function createInputPromptRegistry() {
  const prompts = new Map<string, InputPromptNotice>();

  function clearPrompt(key: string) {
    prompts.delete(key);
  }

  function clearTabPrompt(tabId: string) {
    clearPrompt(getPromptKey(tabId, ""));
  }

  function clearSessionPrompt(sessionName: string) {
    [...prompts.entries()].forEach(([key, notice]) => {
      if (notice.sessionName === sessionName) {
        prompts.delete(key);
      }
    });
  }

  function setPrompt(input: SetPromptInput) {
    const key = getPromptKey(input.tabId, input.sessionName);

    if (!input.prompt) {
      clearSessionPrompt(input.sessionName);
      return false;
    }

    const signature = getPromptSignature(input.sessionName, input.prompt);
    const existing = prompts.get(key);

    if (existing?.signature === signature) {
      return false;
    }

    if (input.tabId) {
      prompts.delete(getPromptKey(null, input.sessionName));
    }

    prompts.set(key, {
      key,
      tabId: input.tabId,
      sessionName: input.sessionName,
      prompt: input.prompt,
      signature
    });
    return true;
  }

  return {
    setPrompt,
    clearPrompt,
    clearTabPrompt,
    clearSessionPrompt,
    getPrompt(key: string) {
      return prompts.get(key) ?? null;
    },
    getPrompts() {
      return [...prompts.values()];
    }
  };
}
