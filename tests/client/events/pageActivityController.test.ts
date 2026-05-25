import { describe, expect, it, vi } from "vitest";

import { createPageActivityController } from "../../../src/client/events/pageActivityController";

function createDocumentLike(initialState: DocumentVisibilityState = "visible") {
  let visibilityState = initialState;
  const listeners = new Map<string, Array<() => void>>();

  return {
    get visibilityState() {
      return visibilityState;
    },
    set visibilityState(nextState: DocumentVisibilityState) {
      visibilityState = nextState;
    },
    addEventListener(type: string, listener: () => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    removeEventListener(type: string, listener: () => void) {
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((item) => item !== listener)
      );
    },
    dispatch(type: string) {
      listeners.get(type)?.forEach((listener) => listener());
    },
    listenerCount(type: string) {
      return listeners.get(type)?.length ?? 0;
    }
  };
}

describe("createPageActivityController", () => {
  it("starts polling and connects events while the page is visible", () => {
    const documentLike = createDocumentLike("visible");
    const polling = {
      start: vi.fn(),
      stop: vi.fn()
    };
    const events = {
      connect: vi.fn(),
      close: vi.fn()
    };
    const refresh = vi.fn();
    const controller = createPageActivityController({
      document: documentLike,
      polling,
      events,
      refresh
    });

    controller.start();

    expect(polling.start).toHaveBeenCalledOnce();
    expect(events.connect).toHaveBeenCalledOnce();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("stops polling and disconnects events while the page is hidden", () => {
    const documentLike = createDocumentLike("visible");
    const polling = {
      start: vi.fn(),
      stop: vi.fn()
    };
    const events = {
      connect: vi.fn(),
      close: vi.fn()
    };
    const controller = createPageActivityController({
      document: documentLike,
      polling,
      events,
      refresh: vi.fn()
    });

    controller.start();
    documentLike.visibilityState = "hidden";
    documentLike.dispatch("visibilitychange");

    expect(polling.stop).toHaveBeenCalledOnce();
    expect(events.close).toHaveBeenCalledOnce();
  });

  it("refreshes once when a hidden page becomes visible again", () => {
    const documentLike = createDocumentLike("hidden");
    const polling = {
      start: vi.fn(),
      stop: vi.fn()
    };
    const events = {
      connect: vi.fn(),
      close: vi.fn()
    };
    const refresh = vi.fn();
    const controller = createPageActivityController({
      document: documentLike,
      polling,
      events,
      refresh
    });

    controller.start();

    expect(polling.stop).toHaveBeenCalledOnce();
    expect(events.close).toHaveBeenCalledOnce();

    documentLike.visibilityState = "visible";
    documentLike.dispatch("visibilitychange");

    expect(polling.start).toHaveBeenCalledOnce();
    expect(events.connect).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("removes listeners and stops background activity on dispose", () => {
    const documentLike = createDocumentLike("visible");
    const polling = {
      start: vi.fn(),
      stop: vi.fn()
    };
    const events = {
      connect: vi.fn(),
      close: vi.fn()
    };
    const controller = createPageActivityController({
      document: documentLike,
      polling,
      events,
      refresh: vi.fn()
    });

    controller.start();
    expect(documentLike.listenerCount("visibilitychange")).toBe(1);

    controller.dispose();

    expect(documentLike.listenerCount("visibilitychange")).toBe(0);
    expect(polling.stop).toHaveBeenCalledOnce();
    expect(events.close).toHaveBeenCalledOnce();
  });
});
