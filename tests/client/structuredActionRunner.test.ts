import { describe, expect, it, vi } from "vitest";

import {
  applyStructuredActionAvailability,
  createStructuredActionRunner
} from "../../src/client/structuredActionRunner";
import type { SessionSummary } from "../../src/client/api/sessionApi";
import type { StructuredPresentationItem } from "../../src/client/structuredPresentation";

function session(name: string, overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    name, windows: 1, status: "detached", lastActivityAt: null, paneCount: 1,
    activeWindowName: "shell", currentCommand: "codex", currentPath: "/tmp",
    gitBranch: null, gitDirty: null, paneDead: false, paneDeadStatus: null,
    preview: null, inputPrompt: { snippet: "Continue?", actions: [] }, ...overrides
  };
}

function item(overrides: Partial<StructuredPresentationItem> = {}): StructuredPresentationItem {
  return {
    id: "event-1", kind: "hook", sessionName: "source", title: "Approval",
    summary: "Approve the command", summarySource: "hook", status: "waiting",
    severity: "warning", attentionRequired: true, role: null, toolName: null,
    parentId: null, messageKey: null, parentMessageKey: null, details: [], stats: {},
    createdAt: "2026-07-14T08:00:00.000Z",
    actions: [{
      id: "approve", label: "Approve", input: "y\r", open: true,
      target: { sessionName: "action-target", projectName: null, view: "terminal" },
      effectiveTarget: { sessionName: "action-target", projectName: null, view: "terminal" },
      style: "primary", enabled: true, disabledReason: null
    }], ...overrides
  };
}

describe("structuredActionRunner", () => {
  it("pre-disables input actions whose exact target is absent without falling back", () => {
    const result = applyStructuredActionAvailability([item()], [session("source")]);
    expect(result[0]?.actions[0]).toMatchObject({
      enabled: false,
      disabledReason: "目标会话不可用",
      effectiveTarget: { sessionName: "action-target" }
    });
  });

  it("pre-disables input actions for a live session that is not input eligible", () => {
    const result = applyStructuredActionAvailability(
      [item()],
      [session("action-target", { inputPrompt: null })]
    );
    expect(result[0]?.actions[0]).toMatchObject({ enabled: false, disabledReason: "目标会话不可用" });
  });

  it("pre-disables navigation-only terminal actions whose session is gone", () => {
    const terminalOnly = item({ actions: [{
      id: "open", label: "Open", input: null, open: true, target: null,
      effectiveTarget: { sessionName: "gone", projectName: null, view: "terminal" },
      style: "secondary", enabled: true, disabledReason: null
    }] });
    expect(applyStructuredActionAvailability([terminalOnly], [session("source")])[0]?.actions[0]?.enabled).toBe(false);
  });

  it("sends input before navigating and navigates only after success", async () => {
    const order: string[] = [];
    const runner = createStructuredActionRunner({
      getSessions: () => [session("action-target")],
      sendInput: async () => { order.push("send"); },
      navigate: () => { order.push("navigate"); },
      refreshSessions: vi.fn()
    });
    await expect(runner.run(item(), "approve")).resolves.toEqual({ ok: true });
    expect(order).toEqual(["send", "navigate"]);
  });

  it("requires fresh prompt validation for action input", async () => {
    const sendInput = vi.fn().mockResolvedValue(undefined);
    const runner = createStructuredActionRunner({
      getSessions: () => [session("action-target")], sendInput,
      navigate: vi.fn(), refreshSessions: vi.fn()
    });
    await runner.run(item(), "approve");
    expect(sendInput).toHaveBeenCalledWith("action-target", "y\r", { requirePrompt: true });
  });

  it("suppresses duplicate clicks while an event action is pending", async () => {
    let resolveSend!: () => void;
    const sendInput = vi.fn(() => new Promise<void>((resolve) => { resolveSend = resolve; }));
    const onStateChange = vi.fn();
    const runner = createStructuredActionRunner({
      getSessions: () => [session("action-target")], sendInput,
      navigate: vi.fn(), refreshSessions: vi.fn(), onStateChange
    });
    const first = runner.run(item(), "approve");
    expect(runner.getActionState("event-1", "approve")).toMatchObject({ pending: true, error: null });
    await expect(runner.run(item(), "approve")).resolves.toEqual({ ok: false, pending: true });
    expect(sendInput).toHaveBeenCalledOnce();
    resolveSend();
    await expect(first).resolves.toEqual({ ok: true });
    expect(runner.getActionState("event-1", "approve")).toEqual({ pending: false, error: null });
  });

  it("retains an accessible failure message for coded and network failures", async () => {
    const coded = Object.assign(new Error("unavailable"), { status: 409, code: "target_session_unavailable" });
    const sendInput = vi.fn().mockRejectedValueOnce(coded).mockRejectedValueOnce(new Error("offline"));
    const runner = createStructuredActionRunner({
      getSessions: () => [session("action-target")], sendInput,
      navigate: vi.fn(), refreshSessions: vi.fn(), onStateChange: vi.fn()
    });
    await runner.run(item(), "approve");
    expect(runner.getActionState("event-1", "approve").error).toContain("目标会话不可用");
    await runner.run(item({ id: "event-2" }), "approve");
    expect(runner.getActionState("event-2", "approve").error).toContain("操作失败");
  });

  it("caps concurrent tracked actions without admitting an unbounded pending map", async () => {
    const sendInput = vi.fn(() => new Promise<void>(() => {}));
    const runner = createStructuredActionRunner({
      getSessions: () => [session("action-target")], sendInput,
      navigate: vi.fn(), refreshSessions: vi.fn()
    });
    for (let index = 0; index < 200; index += 1) {
      void runner.run(item({ id: `event-${index}` }), "approve");
    }
    await expect(runner.run(item({ id: "event-over-limit" }), "approve"))
      .resolves.toEqual({ ok: false, busy: true });
    expect(sendInput).toHaveBeenCalledTimes(200);
  });

  it("retains the event, refreshes sessions, and never navigates after a coded target failure", async () => {
    const refreshSessions = vi.fn().mockResolvedValue(undefined);
    const navigate = vi.fn();
    const error = Object.assign(new Error("Target session unavailable"), {
      status: 409,
      code: "target_session_unavailable"
    });
    const runner = createStructuredActionRunner({
      getSessions: () => [session("action-target")],
      sendInput: vi.fn().mockRejectedValue(error),
      navigate,
      refreshSessions
    });
    await expect(runner.run(item(), "approve")).resolves.toEqual({ ok: false, error });
    expect(refreshSessions).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("allows Kanban-only navigation but never uses it for input", async () => {
    const target = { sessionName: null, projectName: "alpha", view: "kanban" as const };
    const navigation = item({ actions: [{
      id: "board", label: "Board", input: null, open: true, target,
      effectiveTarget: target, style: "secondary", enabled: true, disabledReason: null
    }] });
    const navigate = vi.fn();
    const sendInput = vi.fn();
    const runner = createStructuredActionRunner({
      getSessions: () => [], sendInput, navigate, refreshSessions: vi.fn()
    });
    await expect(runner.run(navigation, "board")).resolves.toEqual({ ok: true });
    expect(navigate).toHaveBeenCalledWith(target);
    expect(sendInput).not.toHaveBeenCalled();
  });
});
