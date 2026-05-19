import { createServer } from "node:http";

import { createApp } from "./createApp.js";
import { getServerConfig } from "./config.js";
import { createTmuxService } from "./services/tmux/createTmuxService.js";
import { createTerminalSocketServer } from "./ws/createTerminalSocketServer.js";

const config = getServerConfig();
const tmuxService = createTmuxService();
const terminalSocketServer = createTerminalSocketServer();
const server = createServer(
  createApp({
    tmuxService,
    killSession: async (name) => {
      await tmuxService.killSession(name);
      terminalSocketServer.notifySessionExit(name);
    }
  })
);

terminalSocketServer.attachToServer(server);

server.listen(config.port, config.host, () => {
  console.log(
    `[${new Date().toISOString()}] Listening on http://${config.host}:${config.port}`
  );
});
