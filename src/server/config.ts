export type ServerConfig = {
  host: string;
  port: number;
};

export function getServerConfig(): ServerConfig {
  return {
    host: process.env.HOST ?? "127.0.0.1",
    port: Number(process.env.PORT ?? "3000")
  };
}
