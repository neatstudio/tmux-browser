// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { installMobileKeyboardViewportController } from "../../src/client/mobileKeyboardViewport";

type ViewportListener = (event: Event) => void;

function createVisualViewport(height: number, offsetTop = 0) {
  const listeners = new Map<string, Set<ViewportListener>>();

  return {
    height,
    offsetTop,
    addEventListener(type: string, listener: ViewportListener) {
      const bucket = listeners.get(type) ?? new Set<ViewportListener>();
      bucket.add(listener);
      listeners.set(type, bucket);
    },
    removeEventListener(type: string, listener: ViewportListener) {
      listeners.get(type)?.delete(listener);
    },
    dispatch(type: string) {
      listeners.get(type)?.forEach((listener) => listener(new Event(type)));
    }
  };
}

function stubMobileWindow(visualViewport: ReturnType<typeof createVisualViewport>) {
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 800
  });
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 390
  });
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: visualViewport
  });
  Object.defineProperty(window.navigator, "maxTouchPoints", {
    configurable: true,
    value: 1
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: query === "(pointer: coarse)",
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }))
  });
}

afterEach(() => {
  document.documentElement.className = "";
  document.documentElement.removeAttribute("style");
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("mobile keyboard viewport controller", () => {
  it("sets a keyboard inset when the visual viewport shrinks", () => {
    const viewport = createVisualViewport(800);
    stubMobileWindow(viewport);

    const controller = installMobileKeyboardViewportController({
      root: document.documentElement
    });

    expect(
      document.documentElement.style.getPropertyValue("--mobile-keyboard-inset")
    ).toBe("0px");
    expect(
      document.documentElement.classList.contains("is-mobile-keyboard-open")
    ).toBe(false);

    viewport.height = 500;
    viewport.dispatch("resize");

    expect(
      document.documentElement.style.getPropertyValue("--mobile-keyboard-inset")
    ).toBe("300px");
    expect(
      document.documentElement.style.getPropertyValue("--mobile-visual-viewport-height")
    ).toBe("500px");
    expect(
      document.documentElement.classList.contains("is-mobile-keyboard-open")
    ).toBe(true);

    controller.dispose();

    expect(
      document.documentElement.classList.contains("is-mobile-keyboard-open")
    ).toBe(false);
    expect(
      document.documentElement.style.getPropertyValue("--mobile-keyboard-inset")
    ).toBe("");
  });

  it("scrolls focused editable fields into the visible viewport on mobile", () => {
    const viewport = createVisualViewport(500);
    stubMobileWindow(viewport);
    const input = document.createElement("textarea");
    const scrollIntoView = vi.fn();
    input.scrollIntoView = scrollIntoView;
    document.body.append(input);

    installMobileKeyboardViewportController({
      root: document.documentElement,
      requestFrame: (callback) => {
        callback(0);
        return 1;
      }
    });

    input.focus();
    input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "center",
      inline: "nearest",
      behavior: "auto"
    });
  });

  it("does not page-scroll editable fields inside the floating session menu", () => {
    const viewport = createVisualViewport(800);
    stubMobileWindow(viewport);
    const panel = document.createElement("div");
    panel.className = "session-floating-menu-panel";
    const input = document.createElement("input");
    const scrollIntoView = vi.fn();
    input.scrollIntoView = scrollIntoView;
    panel.append(input);
    document.body.append(panel);

    installMobileKeyboardViewportController({
      root: document.documentElement,
      requestFrame: (callback) => {
        callback(0);
        return 1;
      }
    });

    input.focus();
    input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    viewport.height = 420;
    viewport.dispatch("resize");
    viewport.dispatch("scroll");

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
  });
});
