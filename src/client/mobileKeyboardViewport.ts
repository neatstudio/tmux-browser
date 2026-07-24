type ViewportControllerOptions = {
  root?: HTMLElement;
  win?: Window;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (handle: number) => void;
};

const KEYBOARD_INSET_PROPERTY = "--mobile-keyboard-inset";
const VISUAL_VIEWPORT_HEIGHT_PROPERTY = "--mobile-visual-viewport-height";
const KEYBOARD_OPEN_CLASS = "is-mobile-keyboard-open";
const KEYBOARD_OPEN_THRESHOLD_PX = 120;

function isCoarseTouchWindow(win: Window) {
  const hasTouch = (win.navigator.maxTouchPoints ?? 0) > 0;
  const coarsePointer =
    typeof win.matchMedia === "function" &&
    win.matchMedia("(pointer: coarse)").matches;
  const narrowViewport = win.innerWidth < 768;

  return hasTouch && (coarsePointer || narrowViewport);
}

function isEditableElement(target: EventTarget | null): target is HTMLElement {
  if (
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return true;
  }

  if (!(target instanceof HTMLInputElement)) {
    return false;
  }

  return ![
    "button",
    "checkbox",
    "color",
    "file",
    "hidden",
    "image",
    "radio",
    "range",
    "reset",
    "submit"
  ].includes(target.type);
}

export function installMobileKeyboardViewportController(
  options: ViewportControllerOptions = {}
) {
  const win = options.win ?? window;
  const root = options.root ?? win.document.documentElement;
  const requestFrame = options.requestFrame ?? win.requestAnimationFrame.bind(win);
  const cancelFrame = options.cancelFrame ?? win.cancelAnimationFrame.bind(win);
  const visualViewport = win.visualViewport;
  let pendingFrame: number | null = null;

  const reset = () => {
    root.classList.remove(KEYBOARD_OPEN_CLASS);
    root.style.removeProperty(KEYBOARD_INSET_PROPERTY);
    root.style.removeProperty(VISUAL_VIEWPORT_HEIGHT_PROPERTY);
  };

  const update = () => {
    if (!visualViewport || !isCoarseTouchWindow(win)) {
      root.style.setProperty(KEYBOARD_INSET_PROPERTY, "0px");
      root.style.setProperty(VISUAL_VIEWPORT_HEIGHT_PROPERTY, "100dvh");
      root.classList.remove(KEYBOARD_OPEN_CLASS);
      return;
    }

    const viewportBottom = visualViewport.offsetTop + visualViewport.height;
    const keyboardInset = Math.max(0, Math.round(win.innerHeight - viewportBottom));
    const visualHeight = Math.max(0, Math.round(visualViewport.height));

    root.style.setProperty(KEYBOARD_INSET_PROPERTY, `${keyboardInset}px`);
    root.style.setProperty(VISUAL_VIEWPORT_HEIGHT_PROPERTY, `${visualHeight}px`);
    root.classList.toggle(
      KEYBOARD_OPEN_CLASS,
      keyboardInset >= KEYBOARD_OPEN_THRESHOLD_PX
    );
  };

  const scheduleFocusedFieldReveal = (target: EventTarget | null) => {
    if (!isCoarseTouchWindow(win) || !isEditableElement(target)) {
      return;
    }

    // The floating menu owns its scroll area. Page-level centering here can
    // fight the soft keyboard's visual viewport animation and refocus loop.
    if (target.closest(".session-floating-menu-panel")) {
      return;
    }

    if (pendingFrame !== null) {
      cancelFrame(pendingFrame);
    }

    pendingFrame = requestFrame(() => {
      pendingFrame = null;
      target.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: "auto"
      });
    });
  };

  const handleViewportChange = () => update();
  const handleFocusIn = (event: FocusEvent) => {
    update();
    scheduleFocusedFieldReveal(event.target);
  };
  const handleFocusOut = () => update();

  update();
  win.addEventListener("resize", handleViewportChange);
  win.document.addEventListener("focusin", handleFocusIn);
  win.document.addEventListener("focusout", handleFocusOut);
  visualViewport?.addEventListener("resize", handleViewportChange);
  visualViewport?.addEventListener("scroll", handleViewportChange);

  return {
    dispose() {
      if (pendingFrame !== null) {
        cancelFrame(pendingFrame);
        pendingFrame = null;
      }

      win.removeEventListener("resize", handleViewportChange);
      win.document.removeEventListener("focusin", handleFocusIn);
      win.document.removeEventListener("focusout", handleFocusOut);
      visualViewport?.removeEventListener("resize", handleViewportChange);
      visualViewport?.removeEventListener("scroll", handleViewportChange);
      reset();
    }
  };
}
