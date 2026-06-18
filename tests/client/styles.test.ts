import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const styles = readFileSync(
  new URL("../../src/client/styles.css", import.meta.url),
  "utf8"
);

describe("client layout styles", () => {
  it("keeps the tab strip pinned while content scrolls underneath", () => {
    expect(styles).toMatch(
      /\.tabs-root\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;/s
    );
  });

  it("hides xterm viewport scrollbars so the terminal does not add browser scroll", () => {
    expect(styles).toMatch(
      /\.terminal-frame\s+\.xterm-viewport\s*\{[^}]*overflow-y:\s*hidden\s*!important;[^}]*scrollbar-width:\s*none;/s
    );
    expect(styles).toMatch(
      /\.terminal-frame\s+\.xterm-viewport::\-webkit-scrollbar\s*\{[^}]*display:\s*none;/s
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
      /\.terminal-status-action-group\s*\{[^}]*display:\s*inline-flex;[^}]*border-left:\s*1px\s+solid\s+rgba\(217,\s*226,\s*234,\s*0\.12\);/s
    );
    expect(styles).toMatch(
      /\.terminal-status-action-group\.is-left\s*\{[^}]*border-left:\s*0;[^}]*border-right:\s*1px\s+solid\s+rgba\(217,\s*226,\s*234,\s*0\.12\);/s
    );
  });

  it("lets long tab rows scroll horizontally without showing a top scrollbar", () => {
    expect(styles).toMatch(
      /\.tabs-root\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;[^}]*overflow:\s*hidden;/s
    );
    expect(styles).toMatch(
      /\.tab-strip\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;[^}]*overflow-x:\s*auto;[^}]*scrollbar-width:\s*none;/s
    );
    expect(styles).toMatch(
      /\.tab-item\s+button:first-child\s*\{[^}]*max-width:\s*clamp\(6rem,\s*14vw,\s*12rem\);[^}]*text-overflow:\s*ellipsis;/s
    );
    expect(styles).toMatch(
      /\.tab-strip::\-webkit-scrollbar\s*\{[^}]*display:\s*none;/s
    );
  });

  it("lets long terminal status rows scroll horizontally without resizing the terminal", () => {
    expect(styles).toMatch(
      /\.terminal-status-bar\s*\{[^}]*overflow-x:\s*auto;/s
    );
    expect(styles).toMatch(
      /\.terminal-status-bar::\-webkit-scrollbar\s*\{[^}]*height:\s*6px;/s
    );
  });

  it("uses compact tab controls so more tabs fit in the top bar", () => {
    expect(styles).toMatch(
      /\.tabs-root\s*\{[^}]*padding:\s*4px\s+6px\s+0;/s
    );
    expect(styles).toMatch(
      /\.tab-item\s+button\s*\{[^}]*min-height:\s*28px;[^}]*padding:\s*0\s+0\.5rem;/s
    );
    expect(styles).toMatch(
      /\.tab-item\s+button:first-child\s*\{[^}]*max-width:\s*clamp\(6rem,\s*14vw,\s*12rem\);/s
    );
    expect(styles).toMatch(
      /\.tab-context-menu\s*\{[^}]*position:\s*fixed;/s
    );
    expect(styles).toMatch(
      /\.tab-item\.is-pinned\s+\.tab-label::before\s*\{[^}]*content:\s*"★";[^}]*color:\s*#ffd37a;/s
    );
  });

  it("uses dynamic viewport height for mobile browser chrome", () => {
    expect(styles).toMatch(
      /\.app-shell\s*\{[^}]*height:\s*100dvh;/s
    );
  });

  it("supports an isolated sidebar layout without the top tab strip", () => {
    expect(styles).toMatch(
      /\.app-shell--sidebar\s*\{[^}]*grid-template-rows:\s*1fr;/s
    );
    expect(styles).toMatch(
      /\.app-shell--sidebar\s+\.tabs-root\s*\{[^}]*display:\s*none;/s
    );
    expect(styles).toMatch(
      /\.app-shell--sidebar\s+\.content-root\s*\{[^}]*grid-template-columns:\s*clamp\(13rem,\s*22vw,\s*18rem\)\s+minmax\(0,\s*1fr\);/s
    );
    expect(styles).toMatch(
      /\.session-sidebar-root\s*\{[^}]*display:\s*none;/s
    );
    expect(styles).toMatch(
      /\.app-shell--sidebar\s+\.session-sidebar-root\s*\{[^}]*display:\s*block;/s
    );
    expect(styles).toMatch(
      /\.app-shell--sidebar\.is-sidebar-collapsed\s+\.content-root\s*\{[^}]*grid-template-columns:\s*3\.35rem\s+minmax\(0,\s*1fr\);/s
    );
    expect(styles).toMatch(
      /\.session-sidebar\.is-collapsed\s+\.session-sidebar-text\s*\{[^}]*display:\s*none;/s
    );
    expect(styles).toMatch(
      /\.session-sidebar\.is-collapsed\s+\.session-sidebar-collapse-hidden\s*\{[^}]*display:\s*none;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.app-shell--sidebar\s+\.session-sidebar\.is-collapsed\s+\.session-sidebar-text\s*\{[^}]*display:\s*inline-flex;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.app-shell--sidebar\s+\.session-sidebar\.is-collapsed\s+\.session-sidebar-collapse-hidden\s*\{[^}]*display:\s*flex;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.app-shell--sidebar\s+\.session-sidebar\.is-collapsed\s+\.session-sidebar-icon\s*\{[^}]*display:\s*none;/s
    );
    expect(styles).toMatch(
      /\.session-sidebar-icon\s*\{[^}]*display:\s*none;/s
    );
    expect(styles).toMatch(
      /\.session-sidebar\.is-collapsed\s+\.session-sidebar-icon\s*\{[^}]*display:\s*grid;/s
    );
    expect(styles).toMatch(
      /\.session-sidebar-item\.is-pinned\s*\{[^}]*border-color:\s*rgba\(255,\s*211,\s*122,\s*0\.58\);[^}]*box-shadow:\s*inset\s+3px\s+0\s+0\s+#ffd37a;/s
    );
    expect(styles).toMatch(
      /\.session-sidebar-group-title\s*\{[^}]*letter-spacing:\s*0\.11em;[^}]*text-transform:\s*uppercase;/s
    );
    expect(styles).toMatch(
      /\.session-sidebar-group\.is-pinned\s+\.session-sidebar-group-title\s*\{[^}]*color:\s*#ffd37a;/s
    );
    expect(styles).toMatch(
      /\.session-sidebar-item\.is-muted\s*\{[^}]*border-color:\s*rgba\(143,\s*217,\s*255,\s*0\.38\);[^}]*box-shadow:\s*inset\s+3px\s+0\s+0\s+#8fd9ff;[^}]*opacity:\s*0\.9;/s
    );
    expect(styles).toMatch(
      /\.session-sidebar-group\.is-muted\s+\.session-sidebar-group-title\s*\{[^}]*color:\s*rgba\(217,\s*226,\s*234,\s*0\.5\);/s
    );
    expect(styles).toMatch(
      /\.session-sidebar-pin\[aria-pressed="true"\]\s*\{[^}]*color:\s*#ffd37a;/s
    );
    expect(styles).toMatch(
      /\.session-sidebar-mute\[aria-pressed="true"\]\s*\{[^}]*background:\s*rgba\(143,\s*217,\s*255,\s*0\.14\);[^}]*color:\s*#8fd9ff;/s
    );
    expect(styles).toMatch(
      /\.session-sidebar-badge\.is-muted\s*\{[^}]*color:\s*#8fd9ff;/s
    );
    expect(styles).toMatch(
      /\.session-sidebar-tool-button\[data-action="refresh-sidebar"\]\s*\{[^}]*font-size:\s*1\.05rem;/s
    );
    expect(styles).toMatch(
      /\.session-sidebar\s*\{[^}]*grid-template-rows:\s*auto\s+auto\s+auto\s+minmax\(0,\s*1fr\)\s+auto\s+auto;/s
    );
    expect(styles).toMatch(
      /\.session-sidebar-timeline\s*\{[^}]*border-top:\s*1px\s+solid\s+rgba\(217,\s*226,\s*234,\s*0\.1\);/s
    );
    expect(styles).toMatch(
      /\.session-sidebar-toolbar\s*\{[^}]*margin-top:\s*0\.45rem;[^}]*border-top:\s*1px\s+solid\s+rgba\(217,\s*226,\s*234,\s*0\.1\);/s
    );
    expect(styles).toMatch(
      /\.session-sidebar-header-actions\s*\{[^}]*display:\s*inline-flex;[^}]*gap:\s*0\.25rem;/s
    );
    expect(styles).toMatch(
      /\.session-sidebar-action-center\s*\{[^}]*min-width:\s*1\.75rem;[^}]*min-height:\s*1\.4rem;/s
    );
    expect(styles).toMatch(
      /\.session-sidebar-action-center\.is-active\s*\{[^}]*border-color:\s*rgba\(255,\s*211,\s*122,\s*0\.66\);/s
    );
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
  });

  it("styles the kanban route as project and agent cards", () => {
    expect(styles).toMatch(
      /\.kanban-root\s*\{[^}]*height:\s*100%;[^}]*overflow:\s*auto;/s
    );
    expect(styles).toMatch(
      /\.kanban-create-form\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/s
    );
    expect(styles).toMatch(
      /\.kanban-template\s*\{[^}]*grid-column:\s*1\s*\/\s*-1;/s
    );
    expect(styles).toMatch(
      /\.kanban-template-list\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(12rem,\s*1fr\)\);/s
    );
    expect(styles).toMatch(
      /\.kanban-project-list\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(18rem,\s*1fr\)\);/s
    );
    expect(styles).toMatch(
      /\.kanban-agent-card\s*\{[^}]*display:\s*grid;[^}]*border:\s*1px\s+solid\s+rgba\(217,\s*226,\s*234,\s*0\.12\);/s
    );
    expect(styles).toMatch(
      /\.kanban-agent-actions\s*\{[^}]*display:\s*flex;[^}]*justify-content:\s*flex-end;/s
    );
    expect(styles).toMatch(
      /\.kanban-project-close\s*\{[^}]*background:\s*rgba\(255,\s*91,\s*91,\s*0\.08\);/s
    );
    expect(styles).toMatch(
      /\.kanban-add-session-form\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;/s
    );
  });

  it("turns sidebar mode into a mobile drawer instead of squeezing the terminal", () => {
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.app-shell--sidebar\s+\.content-root,\s*\.app-shell--sidebar\.is-sidebar-collapsed\s+\.content-root\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.app-shell--sidebar\s+\.session-sidebar-root\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*pointer-events:\s*none;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.app-shell--sidebar\s+\.session-sidebar\s*\{[^}]*width:\s*min\(86vw,\s*20rem\);[^}]*background:\s*linear-gradient\(180deg,\s*rgba\(28,\s*36,\s*45,\s*0\.98\),\s*rgba\(8,\s*12,\s*16,\s*0\.98\)\);[^}]*transform:\s*translateX\(0\);/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.app-shell--sidebar:not\(\.is-mobile-sidebar-open\)\s+\.session-sidebar\s*\{[^}]*transform:\s*translateX\(-100%\);/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.app-shell--sidebar\s+\.panels-root\s*\{[^}]*grid-column:\s*1;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.mobile-sidebar-launcher\s*\{[^}]*display:\s*grid;[^}]*pointer-events:\s*auto;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.session-sidebar-list\s*\{[^}]*overflow:\s*auto;/s
    );
  });

  it("turns the mobile terminal status controls into an expandable sheet", () => {
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.terminal-status-bar\s*\{[^}]*align-items:\s*center;[^}]*overflow:\s*visible;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.terminal-status-mobile-toggle\s*\{[^}]*display:\s*inline-flex;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.terminal-status-action-group\s*\{[^}]*display:\s*none;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.terminal-status-mobile-sheet\s*\{[^}]*position:\s*fixed;[^}]*bottom:\s*calc\(42px\s*\+\s*env\(safe-area-inset-bottom\)\);/s
    );
    expect(styles).toMatch(
      /\.terminal-status-action-group\[data-group="soft-keys"\]\s*\{[^}]*display:\s*none;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.terminal-status-mobile-sheet\s+\.terminal-status-action-group\[data-group="soft-keys"\]\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\);/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*720px\)\s*\{[\s\S]*\.terminal-status-mobile-sheet\s+\.terminal-status-soft-key\s*\{[^}]*min-height:\s*36px;/s
    );
  });

  it("uses an adaptive narrow-phone layout for the sidebar drawer and terminal action sheet", () => {
    expect(styles).toMatch(/@media\s*\(max-width:\s*430px\)\s*\{/);
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*430px\)\s*\{[\s\S]*\.app-shell--sidebar\s+\.session-sidebar\s*\{[^}]*width:\s*calc\(100vw\s*-\s*0\.7rem\);[^}]*max-width:\s*none;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*430px\)\s*\{[\s\S]*\.terminal-status-bar\s*\{[^}]*min-height:\s*38px;[^}]*padding:\s*0\s+0\.35rem;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*430px\)\s*\{[\s\S]*\.terminal-status-mobile-sheet\s*\{[^}]*right:\s*0\.35rem;[^}]*left:\s*0\.35rem;[^}]*padding:\s*0\.46rem;/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*430px\)\s*\{[\s\S]*\.terminal-status-mobile-sheet\s+\.terminal-status-action-group\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(4\.8rem,\s*1fr\)\);/s
    );
    expect(styles).toMatch(
      /@media\s*\(max-width:\s*430px\)\s*\{[\s\S]*\.terminal-status-mobile-sheet\s+\.terminal-status-action-group\[data-group="soft-keys"\]\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(3\.25rem,\s*1fr\)\);/s
    );
  });

  it("styles mobile image upload controls inside the image preview panel", () => {
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
  });
});
