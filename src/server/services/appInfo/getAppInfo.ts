import packageJson from "../../../../package.json" with { type: "json" };

export type AppInfo = {
  name: string;
  version: string;
  commit: string | null;
  builtAt: string | null;
};

export function getAppInfo(): AppInfo {
  return {
    name: packageJson.name,
    version: packageJson.version,
    commit: process.env.TMUX_UI_COMMIT || null,
    builtAt: process.env.TMUX_UI_BUILT_AT || null
  };
}
