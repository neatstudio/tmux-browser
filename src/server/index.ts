import { createServer } from "node:http";

import { createApp } from "./createApp.js";
import { getServerConfig } from "./config.js";
import { createTmuxService } from "./services/tmux/createTmuxService.js";
import { createTmuxSessionListWatcher } from "./services/tmux/createTmuxSessionListWatcher.js";
import { createAppEventHub } from "./services/events/createAppEventHub.js";
import { createAppEventSocketServer } from "./ws/createAppEventSocketServer.js";
import { createTerminalSocketServer } from "./ws/createTerminalSocketServer.js";
import { createTimelineStore } from "./services/timeline/createTimelineStore.js";

const config = getServerConfig();
const tmuxService = createTmuxService();
const eventHub = createAppEventHub();
const sessionListWatcher = createTmuxSessionListWatcher({
  tmuxService,
  eventHub
});
const eventSocketServer = createAppEventSocketServer({ eventHub });
const terminalSocketServer = createTerminalSocketServer();
const server = createServer(
  createApp({
    tmuxService,
    eventHub,
    timelineStore: createTimelineStore({ maxEvents: config.timelineMaxEvents }),
    hookToken: process.env.TMUX_UI_HOOK_TOKEN,
    killSession: async (name) => {
      await tmuxService.killSession(name);
      terminalSocketServer.notifySessionExit(name);
    }
  })
);

eventSocketServer.attachToServer(server);
terminalSocketServer.attachToServer(server);
sessionListWatcher.start();

server.listen(config.port, config.host, () => {
  console.log(
    `[${new Date().toISOString()}] Listening on http://${config.host}:${config.port}`
  );
});
