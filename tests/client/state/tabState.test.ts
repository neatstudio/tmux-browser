// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import { createTabState } from "../../../src/client/state/tabState";

describe("createTabState", () => {
  beforeEach(() => sessionStorage.clear());

  it("restores open browser tabs from sessionStorage without claiming tmux ownership", () => {
    sessionStorage.setItem(
      "browser-tmux-dashboard.tabs",
      JSON.stringify([{ id: "tab-1", sessionName: "build", title: "build" }])
    );

    const state = createTabState();

    expect(state.getTabs()).toEqual([
      { id: "tab-1", sessionName: "build", title: "build" }
    ]);
  });
});
