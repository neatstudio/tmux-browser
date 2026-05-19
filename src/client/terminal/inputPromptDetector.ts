export type TerminalInputPromptAction = {
  label: string;
  input: string;
};

export type TerminalInputPrompt = {
  snippet: string;
  actions: TerminalInputPromptAction[];
};

const ANSI_ESCAPE_PATTERN = /\x1b\[[0-?]*[ -/]*[@-~]/g;
const CHOICE_PROMPT_PATTERN =
  /(?:\[(?:y|yes)(?:\/a)?\/(?:n|no)\]|\((?:y|yes)(?:\/a)?\/(?:n|no)\)|\b(?:y\/a\/n|y\/n|yes\/no)\b)/i;
const QUESTION_PROMPT_PATTERN =
  /\b(?:do you want|would you like|continue|proceed|approve|allow|confirm)\b[\s\S]{0,160}(?:\?|:)/i;
const ENTER_PROMPT_PATTERN = /\bpress\s+(?:enter|return)\b/i;

function normalizeTerminalOutput(output: string) {
  return output
    .replace(ANSI_ESCAPE_PATTERN, "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(-8)
    .join("\n")
    .trim();
}

function compactSnippet(text: string) {
  return text.length > 260 ? text.slice(-260).trimStart() : text;
}

export function detectTerminalInputPrompt(
  output: string
): TerminalInputPrompt | null {
  const snippet = compactSnippet(normalizeTerminalOutput(output));

  if (!snippet) {
    return null;
  }

  if (ENTER_PROMPT_PATTERN.test(snippet)) {
    return {
      snippet,
      actions: [{ label: "Enter", input: "\r" }]
    };
  }

  if (
    CHOICE_PROMPT_PATTERN.test(snippet) ||
    (QUESTION_PROMPT_PATTERN.test(snippet) && /\b(?:yes|no|y|n|all|a)\b/i.test(snippet))
  ) {
    return {
      snippet,
      actions: [
        { label: "y", input: "y\r" },
        { label: "a", input: "a\r" },
        { label: "Enter", input: "\r" }
      ]
    };
  }

  return null;
}
