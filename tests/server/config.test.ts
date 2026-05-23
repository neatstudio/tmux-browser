import { afterEach, describe, expect, it } from "vitest";

import { getServerConfig } from "../../src/server/config";

const originalHost = process.env.HOST;
const originalPort = process.env.PORT;

describe("getServerConfig", () => {
  afterEach(() => {
    process.env.HOST = originalHost;
    process.env.PORT = originalPort;
  });

  it("listens on localhost by default", () => {
    delete process.env.HOST;
    delete process.env.PORT;

    expect(getServerConfig()).toEqual({
      host: "127.0.0.1",
      port: 3000
    });
  });

  it("allows HOST and PORT to override the default bind address", () => {
    process.env.HOST = "127.0.0.1";
    process.env.PORT = "3100";

    expect(getServerConfig()).toEqual({
      host: "127.0.0.1",
      port: 3100
    });
  });

  it("rejects wildcard host binding", () => {
    process.env.HOST = "0.0.0.0";
    delete process.env.PORT;

    expect(() => getServerConfig()).toThrow("HOST=0.0.0.0 is not allowed");
  });
});
