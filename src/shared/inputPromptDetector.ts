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
const NUMBERED_CHOICE_PATTERN =
  /^\s*\d+\.\s+.+?\((?<key>esc|enter|return|space|[a-z0-9])\)\s*$/i;

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

function getPromptSnippet(text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]!;

    if (CHOICE_PROMPT_PATTERN.test(line) || ENTER_PROMPT_PATTERN.test(line)) {
      const previousLine = lines[index - 1];

      if (
        previousLine &&
        (QUESTION_PROMPT_PATTERN.test(previousLine) || /\?\s*$/.test(previousLine))
      ) {
        return `${previousLine}\n${line}`;
      }

      return line;
    }

    if (QUESTION_PROMPT_PATTERN.test(line)) {
      return line;
    }
  }

  return text;
}

function compactSnippet(text: string) {
  return text.length > 260 ? text.slice(-260).trimStart() : text;
}

function inputForChoiceKey(key: string) {
  const normalizedKey = key.toLowerCase();

  if (normalizedKey === "esc") {
    return "\u001b";
  }

  if (normalizedKey === "enter" || normalizedKey === "return") {
    return "\r";
  }

  if (normalizedKey === "space") {
    return " ";
  }

  return `${normalizedKey}\r`;
}

function detectNumberedChoices(snippet: string) {
  const actions: TerminalInputPromptAction[] = [];
  const seenKeys = new Set<string>();

  snippet.split("\n").forEach((line) => {
    const match = line.match(NUMBERED_CHOICE_PATTERN);
    const key = match?.groups?.key.toLowerCase();

    if (!key || seenKeys.has(key)) {
      return;
    }

    seenKeys.add(key);
    actions.push({
      label: key,
      input: inputForChoiceKey(key)
    });
  });

  return actions.length > 0 ? actions : null;
}

export function detectTerminalInputPrompt(
  output: string
): TerminalInputPrompt | null {
  const visibleText = normalizeTerminalOutput(output);
  const snippet = compactSnippet(getPromptSnippet(visibleText));

  if (!snippet) {
    return null;
  }

  const numberedActions = detectNumberedChoices(snippet);

  if (numberedActions) {
    return {
      snippet,
      actions: numberedActions
    };
  }

  if (ENTER_PROMPT_PATTERN.test(snippet)) {
    return {
      snippet,
      actions: [{ label: "Enter", input: "\r" }]
    };
  }

  if (
    CHOICE_PROMPT_PATTERN.test(snippet) ||
    (QUESTION_PROMPT_PATTERN.test(snippet) &&
      /\b(?:yes|no|y|n|all|a)\b/i.test(snippet))
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
