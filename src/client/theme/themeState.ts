export type TerminalTheme = {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
  black?: string;
  red?: string;
  green?: string;
  yellow?: string;
  blue?: string;
  magenta?: string;
  cyan?: string;
  white?: string;
  brightBlack?: string;
  brightRed?: string;
  brightGreen?: string;
  brightYellow?: string;
  brightBlue?: string;
  brightMagenta?: string;
  brightCyan?: string;
  brightWhite?: string;
};

export type AppTheme = {
  id: string;
  label: string;
  swatches: string[];
  cssVars: Record<string, string>;
  terminalTheme: TerminalTheme;
};

const THEME_STORAGE_KEY = "browser-tmux-dashboard-theme";

export const THEMES: AppTheme[] = [
  {
    id: "graphite",
    label: "Graphite",
    swatches: ["#1c232b", "#45515d", "#ffae98"],
    cssVars: {
      "--app-fg": "#d9e2ea",
      "--app-page-bg": "linear-gradient(180deg, #2d3945, #202933 120px, #131a21 100%)",
      "--app-shell-bg": "linear-gradient(180deg, #3a4651 0, #2a343e 36px, #171e25 36px, #121920 100%)",
      "--tabs-bg": "linear-gradient(180deg, #3a4651 0, #2a343e 100%)",
      "--border-strong": "rgba(163, 179, 194, 0.3)",
      "--border-soft": "rgba(173, 186, 196, 0.12)",
      "--tab-bg": "#45515d",
      "--tab-active-bg": "#1c232b",
      "--content-bg": "#151c23",
      "--dashboard-bg": "linear-gradient(180deg, #1c242d, #161d24)",
      "--control-bg": "#10161c",
      "--control-fg": "#e3ebf2",
      "--button-bg": "linear-gradient(180deg, #3b4752, #2b3540)",
      "--terminal-bg": "#111111",
      "--error-fg": "#ffae98"
    },
    terminalTheme: {
      background: "#111111",
      foreground: "#dbe5ed",
      cursor: "#ffffff",
      selectionBackground: "#3b4752",
      black: "#10161c",
      red: "#ff8f7a",
      green: "#92d192",
      yellow: "#e6c384",
      blue: "#8bb8ff",
      magenta: "#d7a6ff",
      cyan: "#7fd7d7",
      white: "#dbe5ed",
      brightBlack: "#697783",
      brightRed: "#ffae98",
      brightGreen: "#b6e3b6",
      brightYellow: "#f0d9a0",
      brightBlue: "#abcaff",
      brightMagenta: "#e3bdff",
      brightCyan: "#a1eded",
      brightWhite: "#ffffff"
    }
  },
  {
    id: "amber",
    label: "Amber",
    swatches: ["#201c16", "#7a5b28", "#e8c76f"],
    cssVars: {
      "--app-fg": "#f0e7d2",
      "--app-page-bg": "linear-gradient(180deg, #393229, #251f19 120px, #15120e 100%)",
      "--app-shell-bg": "linear-gradient(180deg, #3f382e 0, #2c251d 36px, #191510 36px, #11100d 100%)",
      "--tabs-bg": "linear-gradient(180deg, #3f382e 0, #2c251d 100%)",
      "--border-strong": "rgba(232, 199, 111, 0.32)",
      "--border-soft": "rgba(232, 199, 111, 0.14)",
      "--tab-bg": "#4c3b24",
      "--tab-active-bg": "#201c16",
      "--content-bg": "#16130f",
      "--dashboard-bg": "linear-gradient(180deg, #221d16, #16130f)",
      "--control-bg": "#0f0d0a",
      "--control-fg": "#f5ecd8",
      "--button-bg": "linear-gradient(180deg, #5a4524, #34291a)",
      "--terminal-bg": "#100f0c",
      "--error-fg": "#ff9f80"
    },
    terminalTheme: {
      background: "#100f0c",
      foreground: "#f0e7d2",
      cursor: "#e8c76f",
      selectionBackground: "#5a4524",
      black: "#100f0c",
      red: "#ff9f80",
      green: "#9bd18b",
      yellow: "#e8c76f",
      blue: "#8aaed8",
      magenta: "#d9a4d8",
      cyan: "#8fd1c6",
      white: "#f0e7d2",
      brightBlack: "#766b59",
      brightRed: "#ffb49c",
      brightGreen: "#b7e4aa",
      brightYellow: "#f0d890",
      brightBlue: "#a9c7e8",
      brightMagenta: "#e9bee7",
      brightCyan: "#a9e5dc",
      brightWhite: "#fff7e8"
    }
  },
  {
    id: "paper",
    label: "Paper",
    swatches: ["#f5f1e8", "#314a59", "#b3543c"],
    cssVars: {
      "--app-fg": "#1f292e",
      "--app-page-bg": "linear-gradient(180deg, #e9e3d8, #d9e1df 120px, #f5f1e8 100%)",
      "--app-shell-bg": "linear-gradient(180deg, #d4ddd9 0, #c6d3d0 36px, #f1ede4 36px, #f7f4ed 100%)",
      "--tabs-bg": "linear-gradient(180deg, #d4ddd9 0, #c6d3d0 100%)",
      "--border-strong": "rgba(49, 74, 89, 0.28)",
      "--border-soft": "rgba(49, 74, 89, 0.14)",
      "--tab-bg": "#d9e1df",
      "--tab-active-bg": "#f7f4ed",
      "--content-bg": "#f7f4ed",
      "--dashboard-bg": "linear-gradient(180deg, #fbf8f0, #f3efe5)",
      "--control-bg": "#ffffff",
      "--control-fg": "#1f292e",
      "--button-bg": "linear-gradient(180deg, #eef3f1, #d8e2df)",
      "--terminal-bg": "#fbf8f0",
      "--error-fg": "#b3543c"
    },
    terminalTheme: {
      background: "#fbf8f0",
      foreground: "#1f292e",
      cursor: "#314a59",
      selectionBackground: "#d8e2df",
      black: "#1f292e",
      red: "#b3543c",
      green: "#51784b",
      yellow: "#a87428",
      blue: "#326181",
      magenta: "#8a557a",
      cyan: "#3d7971",
      white: "#f5f1e8",
      brightBlack: "#6e7a7c",
      brightRed: "#cc6b52",
      brightGreen: "#6b965f",
      brightYellow: "#c18b3b",
      brightBlue: "#4d7da1",
      brightMagenta: "#a66b95",
      brightCyan: "#5a9990",
      brightWhite: "#ffffff"
    }
  },
  {
    id: "fern",
    label: "Fern",
    swatches: ["#102019", "#4d7d5c", "#e0c36f"],
    cssVars: {
      "--app-fg": "#e2eee6",
      "--app-page-bg": "linear-gradient(180deg, #24372c, #19261f 120px, #0f1713 100%)",
      "--app-shell-bg": "linear-gradient(180deg, #2c4034 0, #1d2b23 36px, #121c16 36px, #0d1511 100%)",
      "--tabs-bg": "linear-gradient(180deg, #2c4034 0, #1d2b23 100%)",
      "--border-strong": "rgba(154, 189, 162, 0.32)",
      "--border-soft": "rgba(154, 189, 162, 0.13)",
      "--tab-bg": "#2f4b3a",
      "--tab-active-bg": "#102019",
      "--content-bg": "#101813",
      "--dashboard-bg": "linear-gradient(180deg, #16251d, #101813)",
      "--control-bg": "#0b130f",
      "--control-fg": "#e8f3eb",
      "--button-bg": "linear-gradient(180deg, #416b4f, #253b2d)",
      "--terminal-bg": "#0b130f",
      "--error-fg": "#f29d83"
    },
    terminalTheme: {
      background: "#0b130f",
      foreground: "#e2eee6",
      cursor: "#e0c36f",
      selectionBackground: "#2f4b3a",
      black: "#0b130f",
      red: "#f29d83",
      green: "#8fcf94",
      yellow: "#e0c36f",
      blue: "#7aa7d9",
      magenta: "#d49bd8",
      cyan: "#83d5bf",
      white: "#e2eee6",
      brightBlack: "#64786b",
      brightRed: "#ffb199",
      brightGreen: "#abe3ad",
      brightYellow: "#ead58c",
      brightBlue: "#9bbfe8",
      brightMagenta: "#e1b7e4",
      brightCyan: "#a4ead8",
      brightWhite: "#ffffff"
    }
  },
  {
    id: "harbor",
    label: "Harbor",
    swatches: ["#0f1b20", "#3d8893", "#f0b86a"],
    cssVars: {
      "--app-fg": "#dceceb",
      "--app-page-bg": "linear-gradient(180deg, #253940, #18282d 120px, #0e171a 100%)",
      "--app-shell-bg": "linear-gradient(180deg, #30474e 0, #203238 36px, #101c20 36px, #0b1417 100%)",
      "--tabs-bg": "linear-gradient(180deg, #30474e 0, #203238 100%)",
      "--border-strong": "rgba(125, 194, 198, 0.34)",
      "--border-soft": "rgba(125, 194, 198, 0.14)",
      "--tab-bg": "#27505a",
      "--tab-active-bg": "#0f1b20",
      "--content-bg": "#0f191c",
      "--dashboard-bg": "linear-gradient(180deg, #15252a, #0f191c)",
      "--control-bg": "#081013",
      "--control-fg": "#e6f2f1",
      "--button-bg": "linear-gradient(180deg, #346a73, #1e4047)",
      "--terminal-bg": "#081013",
      "--error-fg": "#f0b86a"
    },
    terminalTheme: {
      background: "#081013",
      foreground: "#dceceb",
      cursor: "#f0b86a",
      selectionBackground: "#27505a",
      black: "#081013",
      red: "#ef8f82",
      green: "#89d19a",
      yellow: "#f0b86a",
      blue: "#7bb6e8",
      magenta: "#cda3df",
      cyan: "#7fd7df",
      white: "#dceceb",
      brightBlack: "#63777c",
      brightRed: "#ffaaa0",
      brightGreen: "#a9e5b8",
      brightYellow: "#f5cb8d",
      brightBlue: "#9ecbf0",
      brightMagenta: "#ddbfeb",
      brightCyan: "#a2edf2",
      brightWhite: "#ffffff"
    }
  },
  {
    id: "ruby",
    label: "Ruby",
    swatches: ["#241116", "#9a3649", "#f2c572"],
    cssVars: {
      "--app-fg": "#f3e2e3",
      "--app-page-bg": "linear-gradient(180deg, #3d252b, #28181d 120px, #170e11 100%)",
      "--app-shell-bg": "linear-gradient(180deg, #452a31 0, #301c22 36px, #1c1115 36px, #130b0e 100%)",
      "--tabs-bg": "linear-gradient(180deg, #452a31 0, #301c22 100%)",
      "--border-strong": "rgba(230, 153, 166, 0.34)",
      "--border-soft": "rgba(230, 153, 166, 0.14)",
      "--tab-bg": "#5b2531",
      "--tab-active-bg": "#241116",
      "--content-bg": "#190f12",
      "--dashboard-bg": "linear-gradient(180deg, #241318, #190f12)",
      "--control-bg": "#10080a",
      "--control-fg": "#f8e8e8",
      "--button-bg": "linear-gradient(180deg, #783040, #431e27)",
      "--terminal-bg": "#10080a",
      "--error-fg": "#f2c572"
    },
    terminalTheme: {
      background: "#10080a",
      foreground: "#f3e2e3",
      cursor: "#f2c572",
      selectionBackground: "#5b2531",
      black: "#10080a",
      red: "#ef8493",
      green: "#9fd093",
      yellow: "#f2c572",
      blue: "#8eb7e8",
      magenta: "#e29ad2",
      cyan: "#8dd5cf",
      white: "#f3e2e3",
      brightBlack: "#7d6267",
      brightRed: "#f7a4ae",
      brightGreen: "#bae2b0",
      brightYellow: "#f6d594",
      brightBlue: "#abcaf1",
      brightMagenta: "#edb7e1",
      brightCyan: "#ace8e3",
      brightWhite: "#ffffff"
    }
  },
  {
    id: "ink",
    label: "Ink",
    swatches: ["#0b0b0d", "#2f3037", "#d7d7dc"],
    cssVars: {
      "--app-fg": "#ececf0",
      "--app-page-bg": "linear-gradient(180deg, #303137, #1c1d22 120px, #0d0e11 100%)",
      "--app-shell-bg": "linear-gradient(180deg, #373840 0, #24252b 36px, #111216 36px, #0a0b0e 100%)",
      "--tabs-bg": "linear-gradient(180deg, #373840 0, #24252b 100%)",
      "--border-strong": "rgba(215, 215, 220, 0.28)",
      "--border-soft": "rgba(215, 215, 220, 0.12)",
      "--tab-bg": "#2f3037",
      "--tab-active-bg": "#0b0b0d",
      "--content-bg": "#0f1013",
      "--dashboard-bg": "linear-gradient(180deg, #16171b, #0f1013)",
      "--control-bg": "#07080a",
      "--control-fg": "#f0f0f3",
      "--button-bg": "linear-gradient(180deg, #3d3e47, #24252b)",
      "--terminal-bg": "#07080a",
      "--error-fg": "#ff9b8a"
    },
    terminalTheme: {
      background: "#07080a",
      foreground: "#ececf0",
      cursor: "#d7d7dc",
      selectionBackground: "#2f3037",
      black: "#07080a",
      red: "#ff9b8a",
      green: "#97d99d",
      yellow: "#e7cf83",
      blue: "#91bdf4",
      magenta: "#d7a6ef",
      cyan: "#8ad9dc",
      white: "#ececf0",
      brightBlack: "#6c6d76",
      brightRed: "#ffb2a5",
      brightGreen: "#b2ecb7",
      brightYellow: "#f0dda0",
      brightBlue: "#afcff8",
      brightMagenta: "#e4c0f4",
      brightCyan: "#a8edef",
      brightWhite: "#ffffff"
    }
  },
  {
    id: "daylight",
    label: "Daylight",
    swatches: ["#fffaf2", "#3a6d82", "#d15f48"],
    cssVars: {
      "--app-fg": "#263138",
      "--app-page-bg": "linear-gradient(180deg, #f0f6f4, #e6ece8 120px, #fffaf2 100%)",
      "--app-shell-bg": "linear-gradient(180deg, #dce9e6 0, #cfdfdb 36px, #fffaf2 36px, #f8f1e7 100%)",
      "--tabs-bg": "linear-gradient(180deg, #dce9e6 0, #cfdfdb 100%)",
      "--border-strong": "rgba(58, 109, 130, 0.28)",
      "--border-soft": "rgba(58, 109, 130, 0.13)",
      "--tab-bg": "#dbe8e5",
      "--tab-active-bg": "#fffaf2",
      "--content-bg": "#fffaf2",
      "--dashboard-bg": "linear-gradient(180deg, #fffdf7, #f8f1e7)",
      "--control-bg": "#ffffff",
      "--control-fg": "#263138",
      "--button-bg": "linear-gradient(180deg, #eef6f3, #d8e7e3)",
      "--terminal-bg": "#fffdf7",
      "--error-fg": "#d15f48"
    },
    terminalTheme: {
      background: "#fffdf7",
      foreground: "#263138",
      cursor: "#3a6d82",
      selectionBackground: "#d8e7e3",
      black: "#263138",
      red: "#d15f48",
      green: "#4d7f52",
      yellow: "#a27628",
      blue: "#3a6d82",
      magenta: "#8f5d87",
      cyan: "#3f7e7a",
      white: "#fffaf2",
      brightBlack: "#758086",
      brightRed: "#e17660",
      brightGreen: "#669b69",
      brightYellow: "#bd8e3d",
      brightBlue: "#54889e",
      brightMagenta: "#aa76a1",
      brightCyan: "#5a9995",
      brightWhite: "#ffffff"
    }
  }
];

export function getTheme(themeId: string | null | undefined): AppTheme {
  return THEMES.find((theme) => theme.id === themeId) ?? THEMES[0]!;
}

export function loadThemeId(storage: Storage = window.localStorage): string {
  return storage.getItem(THEME_STORAGE_KEY) ?? THEMES[0]!.id;
}

export function saveThemeId(themeId: string, storage: Storage = window.localStorage) {
  storage.setItem(THEME_STORAGE_KEY, themeId);
}

export function applyTheme(
  theme: AppTheme,
  root: HTMLElement = document.documentElement
) {
  Object.entries(theme.cssVars).forEach(([property, value]) => {
    root.style.setProperty(property, value);
  });
  root.dataset.theme = theme.id;
}
