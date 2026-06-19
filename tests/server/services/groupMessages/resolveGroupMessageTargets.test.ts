import { describe, expect, it } from "vitest";

import { resolveGroupMessageTargets } from "../../../../src/server/services/groupMessages/resolveGroupMessageTargets";
import type { KanbanProject } from "../../../../src/server/services/preferences/createPreferenceStore";

const project: KanbanProject = {
  name: "XX Visa",
  path: "~/server/wwwroot/app/xxvisa-v2",
  server: null,
  agents: [
    { kind: "pm", name: "pm", command: null },
    { kind: "review", name: "review", command: null },
    { kind: "codex", name: "codex", command: null },
    {
      kind: "session",
      name: "local-shell",
      command: null,
      sessionName: "local-shell"
    }
  ]
};

describe("resolveGroupMessageTargets", () => {
  it("resolves one explicit live session", () => {
    expect(
      resolveGroupMessageTargets({
        project,
        liveSessionNames: ["xx-visa-pm", "xx-visa-review"],
        fromSession: "xx-visa-pm",
        target: { type: "session", sessionName: "xx-visa-review" }
      })
    ).toEqual({
      sessions: ["xx-visa-review"],
      warnings: []
    });
  });

  it("resolves all other live project sessions in project order", () => {
    expect(
      resolveGroupMessageTargets({
        project,
        liveSessionNames: ["xx-visa-pm", "xx-visa-review", "xx-visa-codex"],
        fromSession: "xx-visa-pm",
        target: { type: "others" }
      })
    ).toEqual({
      sessions: ["xx-visa-review", "xx-visa-codex"],
      warnings: ["Session local-shell is not live"]
    });
  });

  it("rejects role targets when every matching session is missing", () => {
    expect(() =>
      resolveGroupMessageTargets({
        project,
        liveSessionNames: ["xx-visa-pm"],
        fromSession: "xx-visa-pm",
        target: { type: "role", role: "review" }
      })
    ).toThrow("No live target sessions found");
  });

  it("supports manually attached session names and derived role suffixes", () => {
    expect(
      resolveGroupMessageTargets({
        project,
        liveSessionNames: ["local-shell"],
        fromSession: "xx-visa-pm",
        target: { type: "role", role: "shell" }
      })
    ).toEqual({
      sessions: ["local-shell"],
      warnings: []
    });
  });

  it("dedupes targets and rejects empty target results", () => {
    expect(() =>
      resolveGroupMessageTargets({
        project: {
          ...project,
          agents: [
            ...project.agents,
            { kind: "session", name: "review-copy", command: null, sessionName: "xx-visa-review" }
          ]
        },
        liveSessionNames: ["xx-visa-review"],
        fromSession: "xx-visa-pm",
        target: { type: "others" }
      })
    ).not.toThrow();

    expect(() =>
      resolveGroupMessageTargets({
        project,
        liveSessionNames: [],
        fromSession: "xx-visa-pm",
        target: { type: "session", sessionName: "missing" }
      })
    ).toThrow("No live target sessions found");
  });
});
