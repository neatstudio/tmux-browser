import { createServer } from "node:http";

import { createApp } from "./createApp.js";
import { getServerConfig } from "./config.js";

const config = getServerConfig();
const server = createServer(createApp());

server.listen(config.port, config.host, () => {
  console.log(`Listening on http://${config.host}:${config.port}`);
});
