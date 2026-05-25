import { createServer } from "node:http";

import { createApp } from "./createApp.js";
import { getServerConfig } from "./config.js";
import { createTmuxService } from "./services/tmux/createTmuxService.js";
import { createAppEventHub } from "./services/events/createAppEventHub.js";
import { createAppEventSocketServer } from "./ws/createAppEventSocketServer.js";
import { createTerminalSocketServer } from "./ws/createTerminalSocketServer.js";

const config = getServerConfig();
const tmuxService = createTmuxService();
const eventHub = createAppEventHub();
const eventSocketServer = createAppEventSocketServer({ eventHub });
const terminalSocketServer = createTerminalSocketServer();
const server = createServer(
  createApp({
    tmuxService,
    eventHub,
    killSession: async (name) => {
      await tmuxService.killSession(name);
      terminalSocketServer.notifySessionExit(name);
    }
  })
);

eventSocketServer.attachToServer(server);
terminalSocketServer.attachToServer(server);

server.listen(config.port, config.host, () => {
  console.log(
    `[${new Date().toISOString()}] Listening on http://${config.host}:${config.port}`
  );
});
