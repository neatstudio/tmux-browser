import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const styles = readFileSync(
  new URL("../../src/client/styles.css", import.meta.url),
  "utf8"
);

describe("client layout styles", () => {
  it("keeps the page shell chrome-free instead of falling back to tabs", () => {
    expect(styles).not.toContain(".app-shell--tabs");
    expect(styles).not.toContain(".app-shell--sidebar");
    expect(styles).not.toContain(".app-shell--kanban-view .tabs-root");
  });

  it("hides xterm viewport scrollbars so the terminal does not add browser scroll", () => {
    expect(styles).toMatch(
      /\.terminal-frame\s+\.xterm-viewport\s*\{[^}]*overflow-y:\s*hidden\s*!important;[^}]*scrollbar-width:\s*none;/s
    );
    expect(styles).toMatch(
      /\.terminal-frame\s+\.xterm-viewport::\-webkit-scrollbar\s*\{[^}]*display:\s*none;/s
    );
  });

  it("keeps the xterm cursor visibly blinking", () => {
    expect(styles).toContain("@keyframes tmux-ui-terminal-cursor-blink");
    expect(styles).toMatch(
      /\.terminal-frame\s+\.xterm\s+\.xterm-cursor[\s\S]*animation:\s*tmux-ui-terminal-cursor-blink\s+1s\s+steps\(1,\s*end\)\s+infinite;/s
    );
  });

  it("keeps dashboard and terminal content away from panel edges", () => {
    expect(styles).toMatch(
      /\.dashboard-root\s*\{[^}]*padding:\s*clamp\(0\.875rem,\s*1\.7vw,\s*1\.5rem\);/s
    );
    expect(styles).toMatch(
      /\.terminal-frame\s*\{[^}]*padding:\s*0\.75rem;/s
    );
  });

  it("keeps xterm fit calculations inside the padded terminal frame", () => {
    expect(styles).toMatch(
      /\.terminal-panel\s*\{[^}]*padding:\s*0;/s
    );
    expect(styles).toMatch(
      /\.terminal-frame\s*\{[^}]*min-height:\s*0;/s
    );
  });

  it("reserves a bottom row for the terminal page status bar", () => {
    expect(styles).toMatch(
      /\.terminal-panel\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)\s+auto;/s
    );
    expect(styles).toMatch(
      /\.terminal-status-bar\s*\{[^}]*display:\s*flex;[^}]*min-height:\s*32px;/s
    );
    expect(styles).toMatch(
      /\.terminal-status-bar\s*\{[^}]*height:\s*32px;/s
    );
    expect(styles).toMatch(
      /\.terminal-status-bar\s*\{[^}]*flex:\s*0\s+0\s+32px;/s
    );
    expect(styles).toMatch(
      /\.terminal-status-main\s*\{[^}]*flex:\s*1\s+1\s+auto;/s
    );
    expect(styles).toMatch(
      /\.terminal-panel\.has-session-rail\s*\{[^}]*grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\)\s+auto;/s
    );
    expect(styles).toMatch(
      /\.terminal-session-rail\s*\{[^}]*display:\s*flex;[^}]*min-height:\s*34px;/s
    );
    expect(styles).toMatch(
      /\.terminal-session-rail-session\.is-active\s*\{[^}]*background:\s*rgba\(94,\s*255,\s*130,\s*0\.14\);/s
    );
    expect(styles).toMatch(
      /\.terminal-session-rail-session\.is-offline,\s*\.session-floating-menu-session\.is-offline\s*\{[^}]*cursor:\s*not-allowed;[^}]*opacity:\s*0\.52;/s
    );
    expect(styles).toMatch(
      /\.terminal-status-action-group\s*\{[^}]*display:\s*inline-flex;[^}]*border-left:\s*1px\s+solid\s+rgba\(217,\s*226,\s*234,\s*0\.12\);/s
    );
    expect(styles).toMatch(
      /\.terminal-status-action-group\.is-left\s*\{[^}]*border-left:\s*0;[^}]*border-right:\s*1px\s+solid\s+rgba\(217,\s*226,\s*234,\s*0\.12\);/s
    );
    expect(styles).not.toContain('data-group="kanban-sessions"');
    expect(styles).not.toContain(".terminal-status-kanban-label");
    expect(styles).not.toContain('data-action="switch-kanban-session"');
    expect(styles).toMatch(
      /\.session-floating-menu\s*\{[^}]*position:\s*fixed;[^}]*top:\s*0\.55rem;[^}]*right:\s*0\.65rem;/s
    );
    expect(styles).toMatch(
      /\.session-floating-menu-panel\s*\{[^}]*grid-template-columns:\s*minmax\(11rem,\s*0\.88fr\)\s+minmax\(0,\s*1\.62fr\);[^}]*width:\s*min\(84vw,\s*calc\(100vw\s*-\s*1rem\)\);[^}]*max-height:\s*min\(82dvh,\s*40rem\);/s
    );
    expect(styles).toMatch(
      /\.app-shell\[data-ui-tier="desktop"\]\s+\.session-floating-menu-panel\s*\{[^}]*width:\s*min\(90vw,\s*calc\(100vw\s*-\s*1rem\)\);[^}]*max-height:\s*min\(88dvh,\s*48rem\);/s
    );
    expect(styles).toMatch(
      /\.app-shell\[data-ui-tier="phone"\]\s+\.session-floating-menu-panel\s*\{[^}]*width:\s*min\(96vw,\s*calc\(100vw\s*-\s*0\.45rem\)\);[^}]*max-height:\s*min\(76dvh,\s*30rem\);/s
    );
    expect(styles).toMatch(
      /\.session-floating-menu-actions-pane,\s*\.session-floating-menu-sessions-pane\s*\{[^}]*display:\s*grid;[^}]*align-content:\s*start;/s
    );
    expect(styles).toMatch(
      /\.session-floating-menu-actions-pane\s*\{[^}]*border-right:\s*1px\s+solid\s+rgba\(217,\s*226,\s*234,\s*0\.1\);/s
    );
    expect(styles).toMatch(
      /\.session-floating-menu-section\.session-floating-menu-actions\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\);/s
    );
    expect(styles).toMatch(
      /\.session-floating-menu-section\.session-floating-menu-soft-keys\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\);/s
    );
    expect(styles).toMatch(
      /\.session-floating-menu-session\s*\{[^}]*display:\s*grid;[^}]*width:\s*100%;[^}]*text-align:\s*left;/s
    );
    expect(styles).toMatch(
      /\.session-floating-menu-panel button\.session-floating-menu-session\s*\{[^}]*display:\s*grid;/s
    );
    expect(styles).toMatch(
      /\.session-floating-menu-session-item\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);[^}]*flex:\s*0\s+1\s*7\.1rem;/s
    );
    expect(styles).toMatch(
      /\.session-floating-menu-board\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(6\.7rem,\s*1fr\)\);/s
    );
    expect(styles).not.toContain(".session-floating-menu-session-controls");
    expect(styles).toMatch(
      /\.session-floating-menu-session-meta\s*\{[^}]*font-size:\s*0\.54rem;[^}]*text-overflow:\s*ellipsis;/s
    );
    expect(styles).toMatch(
      /\.session-floating-menu-session\.is-active\s*\{[^}]*background:\s*rgba\(94,\s*255,\s*130,\s*0\.11\);[^}]*color:\s*#d5ffd8;/s
    );
    expect(styles).toMatch(
      /\.session-floating-menu-board\s*\{[^}]*display:\s*grid;[^}]*border:\s*1px\s+solid\s+rgba\(255,\s*211,\s*122,\s*0\.2\);[^}]*padding:\s*0\.42rem;/s
    );
    expect(styles).toMatch(
      /\.session-floating-menu-board-label\s*\{[^}]*max-width:\s*100%;[^}]*color:\s*#ffe2a7;[^}]*padding:\s*0\s+0\.28rem;/s
    );
    expect(styles).toMatch(
      /\.app-shell\[data-ui-tier="desktop"\]\s+\.session-floating-menu-session-name\s*\{[^}]*font-size:\s*0\.92rem;/s
    );
    expect(styles).toMatch(
      /\.app-shell\[data-ui-tier="desktop"\]\s+\.session-floating-menu-panel button\s*\{[^}]*min-height:\s*30px;[^}]*font-size:\s*0\.84rem;/s
    );
    expect(styles).toMatch(
      /\.app-shell\[data-ui-tier="phone"\]\s+\.session-floating-menu-panel button\s*\{[^}]*min-height:\s*22px;[^}]*font-size:\s*0\.5rem;/s
    );
    expect(styles).toMatch(
      /\.session-floating-menu-create\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;/s
    );
    expect(styles).toMatch(
      /\.session-floating-menu-create\s+input\s*\{[^}]*min-width:\s*0;[^}]*font-size:\s*0\.68rem;/s
    );
    expect(styles).toContain(".session-floating-menu-projects {");
    expect(styles).toContain("gap: 0.32rem;");
    expect(styles).toContain("padding: 0.45rem;");
    expect(styles).toMatch(
      /\.session-floating-menu-projects\s+\.kanban-create-form\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;/s
    );
    expect(styles).toMatch(
      /\.session-floating-menu-projects\s+\.kanban-create-form button\s*\{[^}]*grid-column:\s*auto;/s
    );
    expect(styles).toContain(".session-floating-menu-project-create {");
    expect(styles).toContain(
      "grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.9fr) auto;"
    );
    expect(styles).toContain(".session-floating-menu-project-move {");
    expect(styles).toContain(
      "grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;"
    );
    expect(styles).toContain(".session-floating-menu-session-actions {");
    expect(styles).toContain("position: fixed;");
    expect(styles).toContain("max-width: min(26rem, calc(100vw - 1rem));");
    expect(styles).toContain("max-height: min(48rem, 78dvh);");
    expect(styles).toMatch(
      /\.session-floating-menu-session-actions\s*\{[^}]*pointer-events:\s*auto;/s
    );
    expect(styles).toMatch(
      /\.session-floating-menu-session-actions a,\s*\.session-floating-menu-session-actions button\s*\{[^}]*cursor:\s*pointer;[^}]*text-decoration:\s*none;/s
    );
    expect(styles).toContain(".app-shell[data-ui-tier=\"desktop\"] .session-floating-menu-session-actions {");
    expect(styles).toContain("max-width: min(31rem, calc(100vw - 1rem));");
    expect(styles).toContain("max-height: min(56rem, 86dvh);");
    expect(styles).toContain(".session-floating-menu-session-actions-separator {");
    expect(styles).toContain("border-top: 1px solid rgba(217, 226, 234, 0.12);");
    expect(styles).toContain(".session-floating-menu-session-actions-header {");
    expect(styles).toContain("font-size: 0.76rem;");
    expect(styles).toContain("letter-spacing: 0.1em;");
    expect(styles).not.toMatch(
      /@media\s*\(max-width:\s*700px\)\s*\{[\s\S]*\.session-floating-menu-panel\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s
    );
    expect(styles).toContain("grid-template-columns: minmax(5.6rem, 0.86fr) minmax(0, 1.64fr);");
    expect(styles).toContain("width: min(96vw, calc(100vw - 0.45rem));");
    expect(styles).toContain("max-height: min(82dvh, 32rem);");
    expect(styles).not.toContain(".session-floating-menu-timeline");
  });

  it("lets long terminal status rows scroll horizontally without resizing the terminal", () => {
    expect(styles).toMatch(
      /\.terminal-status-bar\s*\{[^}]*overflow-x:\s*auto;/s
    );
    expect(styles).toMatch(
      /\.terminal-status-bar::\-webkit-scrollbar\s*\{[^}]*height:\s*6px;/s
    );
  });

  it("uses dynamic viewport height for mobile browser chrome", () => {
    expect(styles).toMatch(
      /\.app-shell\s*\{[^}]*height:\s*100dvh;/s
    );
  });

  it("makes desktop cards visibly larger than the default scale", () => {
    expect(styles).toContain("--dashboard-card-name-size: clamp(1.32rem, 0.92vw + 1.04rem, 2.08rem);");
    expect(styles).toContain("--dashboard-card-meta-size: clamp(1rem, 0.42vw + 0.84rem, 1.25rem);");
    expect(styles).toContain("--dashboard-card-button-size: clamp(0.96rem, 0.28vw + 0.78rem, 1.15rem);");
    expect(styles).toContain("--dashboard-card-button-width: clamp(3.9rem, 1.75vw + 3rem, 5.4rem);");
  });

  it("makes the desktop session list more legible", () => {
    expect(styles).toMatch(
      /\.app-shell\[data-ui-tier="desktop"\]\s+\.session-table tr\s*\{[^}]*gap:\s*0\.56rem;[^}]*padding:\s*0\.72rem\s+0\.78rem;/s
    );
    expect(styles).toMatch(
      /\.app-shell\[data-ui-tier="desktop"\]\s+\.session-name\s*\{[^}]*font-size:\s*clamp\(1\.32rem,\s*0\.92vw\s+\+\s*1\.04rem,\s*2\.08rem\);/s
    );
    expect(styles).toMatch(
      /\.app-shell\[data-ui-tier="desktop"\]\s+\.session-meta\s*\{[^}]*font-size:\s*clamp\(1rem,\s*0\.42vw\s+\+\s*0\.84rem,\s*1\.25rem\);/s
    );
    expect(styles).toMatch(
      /\.app-shell\[data-ui-tier="desktop"\]\s+\.session-path\s*\{[^}]*font-size:\s*clamp\(0\.92rem,\s*0\.3vw\s+\+\s*0\.78rem,\s*1\.08rem\);/s
    );
    expect(styles).toMatch(
      /\.app-shell\[data-ui-tier="desktop"\]\s+\.session-preview\s*\{[^}]*min-height:\s*4\.1rem;[^}]*font-size:\s*clamp\(0\.88rem,\s*0\.3vw\s+\+\s*0\.76rem,\s*1\.08rem\);/s
    );
  });

  it("makes the desktop terminal rail and status bar easier to read", () => {
    expect(styles).toMatch(
      /\.app-shell\[data-ui-tier="desktop"\]\s+\.terminal-session-rail\s*\{[^}]*min-height:\s*44px;[^}]*padding:\s*0\.56rem\s+4\.8rem\s+0\.56rem\s+0\.88rem;/s
    );
    expect(styles).toMatch(
      /\.app-shell\[data-ui-tier="desktop"\]\s+\.terminal-session-rail-project\s*\{[^}]*font-size:\s*0\.94rem;/s
    );
    expect(styles).toMatch(
      /\.app-shell\[data-ui-tier="desktop"\]\s+\.terminal-session-rail-session,\s*\.app-shell\[data-ui-tier="desktop"\]\s+\.terminal-session-rail-overflow\s*\{[^}]*font-size:\s*0\.94rem;/s
    );
    expect(styles).toMatch(
      /\.app-shell\[data-ui-tier="desktop"\]\s+\.terminal-session-rail-action\s*\{[^}]*font-size:\s*0\.82rem;/s
    );
    expect(styles).toMatch(
      /\.app-shell\[data-ui-tier="desktop"\]\s+\.terminal-status-bar\s*\{[^}]*height:\s*42px;[^}]*font-size:\s*14\.5px;/s
    );
    expect(styles).toMatch(
      /\.app-shell\[data-ui-tier="desktop"\]\s+\.terminal-status-action\s*\{[^}]*min-height:\s*32px;[^}]*font-size:\s*13\.25px;/s
    );
  });

  it("keeps the legacy sidebar layout disabled", () => {
    expect(styles).toMatch(
      /\.session-sidebar-root,\s*\.session-sidebar,\s*\.mobile-sidebar-launcher,\s*\.mobile-sidebar-logo,\s*\.mobile-sidebar-count\s*\{[^}]*display:\s*none\s*!important;[^}]*visibility:\s*hidden\s*!important;[^}]*pointer-events:\s*none\s*!important;/s
    );
    expect(styles).not.toContain(".is-sidebar-collapsed");
    expect(styles).not.toContain(".is-mobile-sidebar-open");
    expect(styles).not.toContain(".session-sidebar-header");
    expect(styles).not.toContain(".session-sidebar-item");
    expect(styles).not.toContain(".session-sidebar-kanban");
    expect(styles).not.toContain(".session-sidebar-action-center");
  });

  it("styles the action center as a compact overlay", () => {
    expect(styles).toMatch(
      /\.action-center-backdrop\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*z-index:\s*80;/s
    );
    expect(styles).toMatch(
      /\.action-center-panel\s*\{[^}]*width:\s*min\(28rem,\s*calc\(100vw\s*-\s*1\.5rem\)\);[^}]*max-height:\s*min\(78dvh,\s*44rem\);/s
    );
    expect(styles).toMatch(
      /\.action-center-list\s*\{[^}]*overflow:\s*auto;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.action-center-backdrop\s*\{[^}]*align-items:\s*start;[^}]*padding-top:\s*calc\(0\.7rem\s*\+\s*env\(safe-area-inset-top\)\);/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.action-center-panel\s*\{[^}]*align-self:\s*start;[^}]*width:\s*min\(26rem,\s*calc\(100vw\s*-\s*1rem\)\);[^}]*max-height:\s*min\(52dvh,\s*24rem\);/s
    );
  });

  it("styles the kanban route as project and agent cards", () => {
    expect(styles).toMatch(
      /\.kanban-root\s*\{[^}]*height:\s*100%;[^}]*overflow:\s*auto;/s
    );
    expect(styles).toMatch(
      /\.kanban-create-form\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/s
    );
    expect(styles).toMatch(
      /\.kanban-create-panel\s*\{[^}]*margin-bottom:\s*0\.75rem;[^}]*border:\s*1px\s+solid\s+var\(--border-soft\);/s
    );
    expect(styles).toMatch(
      /\.kanban-create-summary\s*\{[^}]*display:\s*flex;[^}]*min-height:\s*2\.1rem;[^}]*cursor:\s*pointer;/s
    );
    expect(styles).toMatch(
      /\.kanban-template\s*\{[^}]*grid-column:\s*1\s*\/\s*-1;/s
    );
    expect(styles).toMatch(
      /\.kanban-template-list\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(12rem,\s*1fr\)\);/s
    );
    expect(styles).toMatch(
      /\.kanban-project-list\s*\{[^}]*columns:\s*18rem;[^}]*column-gap:\s*0\.6rem;/s
    );
    expect(styles).toMatch(
      /\.kanban-project-list\s*\{[^}]*align-items:\s*start;/s
    );
    expect(styles).toMatch(
      /\.kanban-project-card\s*\{[^}]*break-inside:\s*avoid;[^}]*display:\s*inline-grid;[^}]*width:\s*100%;/s
    );
    expect(styles).toMatch(
      /\.kanban-agent-card\s*\{[^}]*display:\s*grid;[^}]*border:\s*1px\s+solid\s+rgba\(217,\s*226,\s*234,\s*0\.12\);/s
    );
    expect(styles).toMatch(
      /\.kanban-agent-card\.is-offline\s*\{[^}]*border-style:\s*dashed;[^}]*opacity:\s*0\.58;/s
    );
    expect(styles).toMatch(
      /\.kanban-agent-list\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(min\(16rem,\s*100%\),\s*16rem\)\);[^}]*justify-content:\s*start;/s
    );
    expect(styles).toMatch(
      /\.kanban-agent-actions\s*\{[^}]*display:\s*flex;[^}]*justify-content:\s*flex-end;/s
    );
    expect(styles).toMatch(
      /\.kanban-kill-confirm\s*\{[^}]*grid-column:\s*1\s*\/\s*-1;[^}]*background:\s*rgba\(255,\s*91,\s*91,\s*0\.07\);/s
    );
    expect(styles).toMatch(
      /\.kanban-kill-preview\s*\{[^}]*max-height:\s*8\.5rem;[^}]*white-space:\s*pre-wrap;/s
    );
    expect(styles).toMatch(
      /\.kanban-kill-preview-image\s*\{[^}]*display:\s*block;[^}]*width:\s*100%;[^}]*object-fit:\s*cover;/s
    );
    expect(styles).toMatch(
      /\.kanban-kill-actions\s+\[data-action="confirm-kanban-kill"\]\s*\{[^}]*background:\s*rgba\(255,\s*91,\s*91,\s*0\.14\);/s
    );
    expect(styles).toMatch(
      /\.kanban-project-close\s*\{[^}]*background:\s*rgba\(255,\s*91,\s*91,\s*0\.08\);/s
    );
    expect(styles).toMatch(
      /\.kanban-ungrouped\s*\{[^}]*display:\s*grid;[^}]*margin-bottom:\s*0\.75rem;/s
    );
    expect(styles).toMatch(
      /\.kanban-ungrouped-list\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(min\(15rem,\s*100%\),\s*15rem\)\);[^}]*justify-content:\s*start;/s
    );
    expect(styles).toMatch(
      /\.kanban-ungrouped-add-form\s*\{[^}]*display:\s*flex;[^}]*min-width:\s*0;/s
    );
    expect(styles).toMatch(
      /\.kanban-add-session-form\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.kanban-header\s*\{[^}]*padding:\s*0\.38rem\s+0\.48rem;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.kanban-header\s+p\s*\{[^}]*display:\s*none;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.kanban-create-form\s*\{[^}]*gap:\s*0\.28rem;[^}]*padding:\s*0\.42rem;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.kanban-create-summary\s*\{[^}]*min-height:\s*1\.8rem;[^}]*padding:\s*0\.22rem\s+0\.38rem;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.kanban-template-list\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.kanban-project-card,\s*\.kanban-ungrouped\s*\{[^}]*padding:\s*0\.42rem;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.kanban-project-list\s*\{[^}]*display:\s*grid;[^}]*columns:\s*auto;[^}]*gap:\s*0\.42rem;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.kanban-project-header\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+auto;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.kanban-project-actions\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\);/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.kanban-add-session-form\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;[^}]*min-width:\s*0;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.kanban-agent-card\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;[^}]*padding:\s*0\.28rem\s+0\.32rem;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.kanban-agent-actions\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.kanban-ungrouped-card\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;[^}]*padding:\s*0\.28rem\s+0\.32rem;/s
    );
    expect(styles).toMatch(
      /\.group-message-targets\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap;/s
    );
    expect(styles).toMatch(
      /\.group-message-target-pill\s*\{[^}]*display:\s*inline-flex;[^}]*border:\s*1px\s+solid\s+rgba\(217,\s*226,\s*234,\s*0\.14\);/s
    );
    expect(styles).toMatch(
      /\.group-message-compose-card\s*\{[^}]*display:\s*grid;[^}]*border:\s*1px\s+solid\s+rgba\(217,\s*226,\s*234,\s*0\.12\);[^}]*border-radius:\s*10px;[^}]*padding:\s*0\.65rem;/s
    );
    expect(styles).toMatch(
      /\.group-message-kind-select\s*\{[^}]*min-height:\s*2rem;[^}]*border:\s*1px\s+solid\s+rgba\(217,\s*226,\s*234,\s*0\.14\);/s
    );
    expect(styles).toMatch(
      /\.group-message-body\s*\{[^}]*min-height:\s*6rem;[^}]*font-size:\s*0\.78rem;[^}]*line-height:\s*1\.35;/s
    );
    expect(styles).toMatch(
      /\.group-message-send\s*\{[^}]*justify-self:\s*end;[^}]*min-width:\s*4rem;[^}]*border-radius:\s*3px;/s
    );
  });

  it("turns the mobile terminal status controls into an expandable sheet", () => {
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*1200px\)\s*\{[\s\S]*\.terminal-status-bar\s*\{[^}]*align-items:\s*center;[^}]*overflow:\s*visible;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*1200px\)\s*\{[\s\S]*\.terminal-status-mobile-toggle\s*\{[^}]*display:\s*inline-flex;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*1200px\)\s*\{[\s\S]*\.terminal-status-action-group\s*\{[^}]*display:\s*none;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*1200px\)\s*\{[\s\S]*\.terminal-status-mobile-sheet\s*\{[^}]*position:\s*fixed;[^}]*right:\s*0\.55rem;[^}]*bottom:\s*calc\(3rem\s*\+\s*env\(safe-area-inset-bottom\)\);[^}]*left:\s*auto;[^}]*width:\s*min\(16rem,\s*calc\(100vw\s*-\s*0\.7rem\)\);/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*1200px\)\s*\{[\s\S]*\.terminal-status-mobile-sheet\s*\{[^}]*max-height:\s*min\(40dvh,\s*18rem\);[^}]*padding:\s*0\.32rem;/s
    );
    expect(styles).toMatch(
      /\.terminal-status-action-group\[data-group="soft-keys"\]\s*\{[^}]*display:\s*none;/s
    );
    expect(styles).toMatch(
      /\.terminal-status-action-group\[data-group="mobile-cursor-keys"\]\s*\{[^}]*display:\s*none;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*1200px\)\s*\{[\s\S]*\.terminal-status-action-group\[data-group="mobile-cursor-keys"\]\s*\{[^}]*display:\s*inline-grid;[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(1\.45rem,\s*1fr\)\);/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*1200px\)\s*\{[\s\S]*\.terminal-status-mobile-sheet\s+\.terminal-status-action-group\[data-group="soft-keys"\]\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\);/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*1200px\)\s*\{[\s\S]*\.terminal-status-mobile-sheet\s+\.terminal-status-action-group\[data-group="kanban-groups"\]\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*1fr;[^}]*gap:\s*0\.12rem;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*1200px\)\s*\{[\s\S]*\.terminal-status-mobile-sheet\s+\.terminal-status-soft-key\s*\{[^}]*min-height:\s*24px;/s
    );
  });

  it("uses an adaptive narrow-phone layout for the top-right menu and terminal action sheet", () => {
    expect(styles).toMatch(/@media\s*\(max-width:\s*430px\)\s*\{/);
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*430px\)\s*\{[\s\S]*\.terminal-status-bar\s*\{[^}]*min-height:\s*38px;[^}]*padding:\s*0\s+0\.35rem;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.terminal-session-rail\s*\{[^}]*overflow-x:\s*auto;[^}]*padding:\s*0\.24rem\s+3\.1rem\s+0\.24rem\s+0\.42rem;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.session-floating-menu\s*\{[^}]*top:\s*calc\(2\.35rem\s*\+\s*env\(safe-area-inset-top\)\);/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*430px\)\s*\{[\s\S]*\.terminal-session-rail\s*\{[^}]*min-height:\s*28px;[^}]*padding:\s*0\.2rem\s+2\.8rem\s+0\.2rem\s+0\.34rem;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*430px\)\s*\{[\s\S]*\.session-floating-menu\s*\{[^}]*top:\s*calc\(2\.15rem\s*\+\s*env\(safe-area-inset-top\)\);/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*430px\)\s*\{[\s\S]*\.session-floating-menu-panel\s*\{[^}]*grid-template-columns:\s*minmax\(5\.6rem,\s*0\.86fr\)\s+minmax\(0,\s*1\.64fr\);/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*430px\)\s*\{[\s\S]*\.session-floating-menu-actions-pane\s*\{[^}]*border-right:\s*1px\s+solid\s+rgba\(217,\s*226,\s*234,\s*0\.1\);[^}]*padding-right:\s*0\.12rem;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*430px\)\s*\{[\s\S]*\.session-floating-menu-panel button\s*\{[^}]*min-height:\s*22px;[^}]*font-size:\s*0\.5rem;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*430px\)\s*\{[\s\S]*\.session-floating-menu-section\.session-floating-menu-actions\s*\{[^}]*gap:\s*0\.09rem;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*430px\)\s*\{[\s\S]*\.session-floating-menu-board\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(6\.1rem,\s*1fr\)\);/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*430px\)\s*\{[\s\S]*\.terminal-status-mobile-sheet\s*\{[^}]*right:\s*0\.35rem;[^}]*left:\s*auto;[^}]*width:\s*min\(15rem,\s*calc\(100vw\s*-\s*0\.7rem\)\);[^}]*padding:\s*0\.24rem;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*430px\)\s*\{[\s\S]*\.terminal-status-mobile-sheet\s+\.terminal-status-action-group\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(3\.2rem,\s*1fr\)\);/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*430px\)\s*\{[\s\S]*\.terminal-status-mobile-sheet\s+\.terminal-status-action-group\[data-group="soft-keys"\]\s*\{[^}]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\);/s
    );
    expect(styles).toMatch(
      /\.kanban-template-item\s*\{[^}]*padding:\s*0\.46rem;/s
    );
    expect(styles).toMatch(
      /\.kanban-template-item\.is-compact\s*\{[^}]*padding:\s*0\.28rem;/s
    );
    expect(styles).toMatch(
      /\.kanban-template-item\.is-compact\s+\.kanban-template-info\s+strong\s*\{[^}]*font-size:\s*0\.72rem;/s
    );
    expect(styles).toMatch(
      /\.kanban-create-panel-content\[data-ui-tier="phone"\]\s+\.kanban-create-form\s+label:nth-child\(n \+ 2\),\s*\.kanban-create-panel-content\[data-ui-tier="pad"\]\s+\.kanban-create-form\s+label:nth-child\(n \+ 2\)\s*\{[^}]*display:\s*none;/s
    );
  });

  it("styles mobile image upload controls inside the image preview panel", () => {
    expect(styles).toMatch(
      /\.image-preview-backdrop\s*\{[^}]*z-index:\s*60;/s
    );
    expect(styles).toMatch(
      /\.image-preview-upload\s*\{[^}]*display:\s*grid;[^}]*gap:\s*0\.35rem;/s
    );
    expect(styles).toMatch(
      /\.image-preview-file-input\s*\{[^}]*position:\s*absolute;[^}]*opacity:\s*0;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.image-preview-panel\s*\{[^}]*width:\s*calc\(100vw\s*-\s*1rem\);/s
    );
  });

  it("stacks multiple input prompts without letting the toast exceed the viewport", () => {
    expect(styles).toMatch(
      /\.input-prompt-toast\s*\{[^}]*max-height:\s*min\(70dvh,\s*34rem\);[^}]*overflow:\s*auto;[^}]*display:\s*grid;/s
    );
    expect(styles).toMatch(
      /\.input-prompt-card\s*\{[^}]*border:\s*1px\s+solid\s+rgba\(191,\s*255,\s*196,\s*0\.28\);[^}]*background:/s
    );
  });

  it("styles tmux session status badges next to session names", () => {
    expect(styles).toMatch(
      /\.session-name-cell\s*\{[^}]*display:\s*grid;/s
    );
    expect(styles).toMatch(
      /\.session-status\.is-attached\s*\{[^}]*color:\s*#bfffc4;/s
    );
    expect(styles).toMatch(
      /\.session-status\.is-detached\s*\{[^}]*color:\s*rgba\(217,\s*226,\s*234,\s*0\.62\);/s
    );
    expect(styles).toMatch(
      /\.session-status,\s*\.session-browser-status\s*\{[^}]*text-transform:\s*uppercase;/s
    );
    expect(styles).toMatch(
      /\.session-browser-status\.is-browser-active\s*\{[^}]*color:\s*#8fd9ff;/s
    );
    expect(styles).toMatch(
      /\.session-browser-status\.is-browser-open\s*\{[^}]*color:\s*rgba\(143,\s*217,\s*255,\s*0\.72\);/s
    );
    expect(styles).toMatch(
      /\.session-meta\s*\{[^}]*display:\s*flex;[^}]*justify-content:\s*flex-start;/s
    );
    expect(styles).toMatch(
      /\.session-meta\s*\{[^}]*flex-wrap:\s*nowrap;[^}]*overflow:\s*hidden;[^}]*white-space:\s*nowrap;/s
    );
    expect(styles).toMatch(
      /\.session-meta-item\s*\{[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s
    );
    expect(styles).toMatch(
      /\.session-meta-item\.is-failed\s*\{[^}]*color:\s*var\(--error-fg\);/s
    );
  });

  it("uses compact dashboard chrome on tablet-sized screens", () => {
    expect(styles).toMatch(/@media\s*\(max-width:\s*1024px\)\s*\{/);
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*1024px\)\s*\{[\s\S]*\.dashboard-header\s*\{[^}]*padding:\s*0\.55rem\s+0\.65rem;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*1024px\)\s*\{[\s\S]*\.dashboard\s+h1\s*\{[^}]*font-size:\s*0\.95rem;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*1024px\)\s*\{[\s\S]*\.theme-swatch\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*10px\);/s
    );
  });

  it("uses a responsive card grid for session rows at dashboard widths", () => {
    expect(styles).toMatch(
      /\.session-table\s+tbody\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*1024px\)\s*\{[\s\S]*\.session-table\s+tbody\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/s
    );
    expect(styles).toMatch(
      /@media\s*\(min-width:\s*1400px\)\s*\{[\s\S]*\.session-table\s+tbody\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\);/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*760px\)\s*\{[\s\S]*\.session-table\s+tbody\s*\{[^}]*grid-template-columns:\s*1fr;/s
    );
    expect(styles).toMatch(
      /\.session-table\s+tr\s*\{[^}]*display:\s*grid;[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)\s+auto;[^}]*border-radius:\s*3px;/s
    );
    expect(styles).toMatch(
      /\.session-table\s+td\s*\{[^}]*border-bottom:\s*0;[^}]*min-width:\s*0;[^}]*padding:\s*0;/s
    );
    expect(styles).toMatch(
      /\.session-name-header\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;[^}]*min-width:\s*0;/s
    );
    expect(styles).toMatch(
      /\.session-title-cluster\s*\{[^}]*display:\s*inline-flex;/s
    );
    expect(styles).toMatch(
      /\.session-path\s*\{[^}]*display:\s*block;[^}]*width:\s*100%;/s
    );
    expect(styles).toMatch(
      /\.session-path\s*\{[^}]*font-size:\s*calc\(var\(--dashboard-card-meta-size\)\s*\*\s*0\.88\);/s
    );
    expect(styles).toMatch(
      /\.session-detail-row\s*\{[^}]*min-width:\s*0;[^}]*overflow:\s*hidden;/s
    );
    expect(styles).toMatch(
      /\.session-table\s+td:last-child\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;/s
    );
    expect(styles).toMatch(
      /--dashboard-card-name-size:\s*clamp\(1rem,\s*0\.48vw\s*\+\s*0\.86rem,\s*1\.35rem\);/s
    );
    expect(styles).toMatch(
      /\.session-table\s+button\s*\{[^}]*min-height:\s*20px;[^}]*min-width:\s*var\(--dashboard-card-button-width\);[^}]*padding:\s*0\.08rem\s+0\.28rem;/s
    );
    expect(styles).toMatch(
      /\.session-table\s+\.session-icon-button\s*\{[^}]*border-color:\s*transparent;[^}]*min-width:\s*1\.35rem;[^}]*width:\s*1\.35rem;[^}]*background:\s*transparent;[^}]*padding:\s*0;/s
    );
    expect(styles).toMatch(
      /\.session-table\s+\.session-rename-button,\s*\.session-table\s+\.session-config-button\s*\{[^}]*font-size:\s*calc\(var\(--dashboard-card-name-size\)\s*\*\s*0\.9\);/s
    );
    expect(styles).toMatch(
      /\.session-table\s+\.session-rename-button\s*\{[^}]*transform:\s*scaleX\(-1\);/s
    );
    expect(styles).toMatch(
      /\.session-table\s+\.session-icon-button:hover,\s*\.session-table\s+\.session-icon-button:focus-visible\s*\{[^}]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.08\);/s
    );
    expect(styles).toMatch(
      /\.session-table\s+\.session-kill-button\s*\{[^}]*border-color:\s*transparent;[^}]*min-width:\s*1\.8rem;[^}]*width:\s*1\.8rem;[^}]*background:\s*transparent;[^}]*padding:\s*0;/s
    );
    expect(styles).toMatch(
      /\.session-action-buttons\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*var\(--dashboard-card-button-width\)\s+1\.8rem;[^}]*gap:\s*0\.46rem;/s
    );
    expect(styles).toMatch(
      /\.dashboard-header-actions\s*\{[^}]*display:\s*inline-flex;[^}]*margin-left:\s*auto;/s
    );
    expect(styles).toMatch(
      /\.dashboard-refresh-button,\s*\.dashboard-theme-menu\s*\{[^}]*position:\s*relative;/s
    );
    expect(styles).toMatch(
      /\.dashboard-theme-toolbar\s*\{[^}]*position:\s*absolute;/s
    );
  });

  it("keeps mobile card actions in one compact row", () => {
    expect(styles).toMatch(/@media\s*\(max-width:\s*720px\)\s*\{/);
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.dashboard-header\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.server-status\s+\.session-meta-item:nth-child\(n\+3\)\s*\{[^}]*display:\s*none;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.session-form\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*760px\)\s*\{[\s\S]*\.session-table\s+tbody\s*\{[^}]*grid-template-columns:\s*1fr;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.session-table\s+td:last-child\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.session-table\s+td:last-child::before\s*\{[^}]*display:\s*none;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.session-rename-form\s*\{[^}]*grid-column:\s*1\s*\/\s*-1;/s
    );
  });

  it("keeps the image preview overlay compact until a real image is selected", () => {
    expect(styles).toMatch(
      /\.image-preview-panel\s*\{[^}]*grid-template-rows:\s*auto\s+auto\s+minmax\(0,\s*1fr\);/s
    );
    expect(styles).toMatch(
      /\.image-preview-panel\.is-compact\s*\{[^}]*height:\s*auto;[^}]*min-height:\s*0;/s
    );
    expect(styles).toMatch(
      /\.image-preview-panel\.is-compact\s+\.image-preview-body\s*\{[^}]*display:\s*none;/s
    );
    expect(styles).toMatch(
      /\.image-preview-panel\.has-image\s+\.image-preview-body\s*\{[^}]*display:\s*grid;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.image-preview-panel\.has-image\s*\{[^}]*height:\s*min\(72dvh,\s*34rem\);/s
    );
  });
});
