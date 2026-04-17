export type TmuxSessionSummary = {
  name: string;
  windows: number;
};

export function parseTmuxListOutput(output: string): TmuxSessionSummary[] {
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(.*?):\s+(\d+)\s+windows?/);

      if (!match) {
        throw new Error(`Unsupported tmux output: ${line}`);
      }

      return {
        name: match[1],
        windows: Number(match[2])
      };
    });
}
