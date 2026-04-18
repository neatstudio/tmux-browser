import type { DashboardState } from "../state/dashboardStore";

export function renderDashboard(
  root: HTMLElement,
  state: DashboardState,
  actions: {
    onCreateSession: (name: string) => void;
    onOpenSession: (name: string) => void;
    onKillSession: (name: string) => void;
  }
) {
  root.innerHTML = "";

  const section = document.createElement("section");
  section.className = "dashboard";

  const heading = document.createElement("h1");
  heading.textContent = "Tmux Sessions";
  section.append(heading);

  const createRow = document.createElement("form");
  createRow.className = "session-form";

  const input = document.createElement("input");
  input.name = "sessionName";
  input.placeholder = "new-session";

  const button = document.createElement("button");
  button.type = "submit";
  button.textContent = "Create";

  createRow.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = input.value.trim();

    if (!name) {
      return;
    }

    actions.onCreateSession(name);
    input.value = "";
  });

  createRow.append(input, button);
  section.append(createRow);

  if (state.error) {
    const error = document.createElement("p");
    error.className = "error";
    error.textContent = state.error;
    section.append(error);
  }

  const table = document.createElement("table");
  table.className = "session-table";

  const body = document.createElement("tbody");

  state.sessions.forEach((session) => {
    const row = document.createElement("tr");

    const nameCell = document.createElement("td");
    nameCell.textContent = session.name;

    const windowsCell = document.createElement("td");
    windowsCell.textContent = `${session.windows} windows`;

    const actionsCell = document.createElement("td");

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.textContent = "Open";
    openButton.addEventListener("click", () => actions.onOpenSession(session.name));

    const killButton = document.createElement("button");
    killButton.type = "button";
    killButton.textContent = "Kill";
    killButton.addEventListener("click", () => actions.onKillSession(session.name));

    actionsCell.append(openButton, killButton);
    row.append(nameCell, windowsCell, actionsCell);
    body.append(row);
  });

  table.append(body);
  section.append(table);
  root.append(section);
}
