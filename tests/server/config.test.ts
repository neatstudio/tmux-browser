import { afterEach, describe, expect, it } from "vitest";

import { getServerConfig } from "../../src/server/config";

const originalHost = process.env.HOST;
const originalPort = process.env.PORT;
const originalTimelineMaxEvents = process.env.TMUX_UI_TIMELINE_MAX_EVENTS;

describe("getServerConfig", () => {
  afterEach(() => {
    if (originalHost === undefined) delete process.env.HOST;
    else process.env.HOST = originalHost;
    if (originalPort === undefined) delete process.env.PORT;
    else process.env.PORT = originalPort;
    if (originalTimelineMaxEvents === undefined) {
      delete process.env.TMUX_UI_TIMELINE_MAX_EVENTS;
    } else {
      process.env.TMUX_UI_TIMELINE_MAX_EVENTS = originalTimelineMaxEvents;
    }
  });

  it("listens on localhost by default", () => {
    delete process.env.HOST;
    delete process.env.PORT;
    delete process.env.TMUX_UI_TIMELINE_MAX_EVENTS;

    expect(getServerConfig()).toEqual({
      host: "127.0.0.1",
      port: 3000,
      timelineMaxEvents: 1000
    });
  });

  it.each(["0", "-1", "1.5", "nope", "", "1e3", "+10", " 10 "])(
    "rejects invalid TMUX_UI_TIMELINE_MAX_EVENTS=%s",
    (value) => {
      process.env.TMUX_UI_TIMELINE_MAX_EVENTS = value;
      expect(() => getServerConfig()).toThrow(
        "TMUX_UI_TIMELINE_MAX_EVENTS must be a positive integer"
      );
    }
  );

  it("accepts a positive timeline retention limit", () => {
    process.env.TMUX_UI_TIMELINE_MAX_EVENTS = "2500";
    expect(getServerConfig().timelineMaxEvents).toBe(2500);
  });

  it("allows HOST and PORT to override the default bind address", () => {
    process.env.HOST = "127.0.0.1";
    process.env.PORT = "3100";

    expect(getServerConfig()).toEqual({
      host: "127.0.0.1",
      port: 3100,
      timelineMaxEvents: 1000
    });
  });

  it("rejects wildcard host binding", () => {
    process.env.HOST = "0.0.0.0";
    delete process.env.PORT;

    expect(() => getServerConfig()).toThrow("HOST=0.0.0.0 is not allowed");
  });
});
