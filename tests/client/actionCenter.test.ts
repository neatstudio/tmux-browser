import { describe, expect, it } from "vitest";

import { deriveActionCenterItems } from "../../src/client/actionCenter";
import type { SessionSummary } from "../../src/client/api/sessionApi";
import type { InputPromptNotice } from "../../src/client/state/inputPromptRegistry";

const BASE_SESSION: SessionSummary = {
  name: "api",
  windows: 1,
  status: "detached",
  lastActivityAt: 1_778_000_000,
  paneCount: 1,
  activeWindowName: "zsh",
  currentCommand: "zsh",
  currentPath: "/Users/gouki/server/wwwroot/gemm4",
  gitBranch: null,
  gitDirty: null,
  paneDead: false,
  paneDeadStatus: null,
  preview: null,
  inputPrompt: null
};

const PROMPT: InputPromptNotice = {
  key: "session:codex",
  tabId: null,
  sessionName: "codex",
  signature: "codex:Yes, proceed?:Yes",
  prompt: {
    snippet: "Yes, proceed?",
    actions: [{ key: "y", label: "Yes", input: "y" }]
  }
};

describe("deriveActionCenterItems", () => {
  it("collects terminal input prompts and dead panes as user actions", () => {
    const items = deriveActionCenterItems({
      prompts: [PROMPT],
      sessions: [
        BASE_SESSION,
        {
          ...BASE_SESSION,
          name: "worker",
          paneDead: true,
          paneDeadStatus: 1
        }
      ]
    });

    expect(items).toEqual([
      {
        type: "input-prompt",
        id: "prompt:session:codex",
        sessionName: "codex",
        promptKey: "session:codex",
        title: "codex waiting",
        snippet: "Yes, proceed?",
        actions: [{ key: "y", label: "Yes", input: "y" }]
      },
      {
        type: "dead-pane",
        id: "dead-pane:worker",
        sessionName: "worker",
        title: "worker pane exited",
        status: 1
      }
    ]);
  });

  it("uses pane-level dead state when pane data is available", () => {
    const items = deriveActionCenterItems({
      prompts: [],
      sessions: [
        {
          ...BASE_SESSION,
          panes: [
            {
              sessionName: "api",
              paneId: "%1",
              windowIndex: 0,
              windowName: "zsh",
              windowActive: true,
              paneIndex: 0,
              paneActive: false,
              currentCommand: "node",
              currentPath: "/tmp",
              paneDead: true,
              paneDeadStatus: 0,
              panePid: 123
            }
          ]
        }
      ]
    });

    expect(items).toMatchObject([
      {
        type: "dead-pane",
        id: "dead-pane:api:%1",
        sessionName: "api",
        paneId: "%1",
        title: "api pane %1 exited",
        status: 0
      }
    ]);
  });

  it("promotes waiting and blocked hook timeline events into actions", () => {
    const items = deriveActionCenterItems({
      prompts: [],
      sessions: [BASE_SESSION],
      timelineEvents: [
        {
          id: "hook-1",
          type: "hook-event",
          sessionName: "codex",
          message: "Need approval",
          createdAt: "2026-06-29T10:00:00.000Z",
          metadata: {
            source: "codex",
            eventType: "approval-required",
            status: "waiting",
            body: "Approve file edit?",
            taskId: "task-1"
          }
        },
        {
          id: "hook-2",
          type: "hook-event",
          sessionName: "worker",
          message: "Task finished",
          createdAt: "2026-06-29T10:01:00.000Z",
          metadata: {
            source: "claude",
            eventType: "task-done",
            status: "done"
          }
        }
      ]
    });

    expect(items).toEqual([
      {
        type: "hook-event",
        id: "hook:hook-1",
        sessionName: "codex",
        source: "codex",
        eventType: "approval-required",
        status: "waiting",
        title: "Need approval",
        body: "Approve file edit?",
        taskId: "task-1"
      }
    ]);
  });
});
