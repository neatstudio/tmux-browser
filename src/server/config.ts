export type ServerConfig = {
  host: string;
  port: number;
};

export function getServerConfig(): ServerConfig {
  const host = process.env.HOST ?? "127.0.0.1";

  if (host === "0.0.0.0") {
    throw new Error(
      "HOST=0.0.0.0 is not allowed; bind to 127.0.0.1 or a specific private IP"
    );
  }

  return {
    host,
    port: Number(process.env.PORT ?? "3000")
  };
}
