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
      /\.terminal-status-main\s*\{[^}]*flex:\s*1\s+1\s+auto;/s
    );
    expect(styles).toMatch(
      /\.terminal-status-actions\s*\{[^}]*margin-left:\s*auto;/s
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
      /\.tab-item\.is-pinned\s+\.tab-label::before\s*\{[^}]*content:\s*"";/s
    );
  });

  it("uses dynamic viewport height for mobile browser chrome", () => {
    expect(styles).toMatch(
      /\.app-shell\s*\{[^}]*height:\s*100dvh;/s
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
});
