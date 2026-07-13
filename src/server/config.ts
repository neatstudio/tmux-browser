export type ServerConfig = {
  host: string;
  port: number;
  timelineMaxEvents: number;
};

export function getServerConfig(): ServerConfig {
  const host = process.env.HOST ?? "127.0.0.1";
  const timelineMaxEventsValue = process.env.TMUX_UI_TIMELINE_MAX_EVENTS ?? "1000";
  const timelineMaxEvents = Number(timelineMaxEventsValue);

  if (host === "0.0.0.0") {
    throw new Error(
      "HOST=0.0.0.0 is not allowed; bind to 127.0.0.1 or a specific private IP"
    );
  }
  if (
    !/^[1-9]\d*$/.test(timelineMaxEventsValue) ||
    !Number.isInteger(timelineMaxEvents) ||
    timelineMaxEvents <= 0
  ) {
    throw new Error("TMUX_UI_TIMELINE_MAX_EVENTS must be a positive integer");
  }

  return {
    host,
    port: Number(process.env.PORT ?? "3000"),
    timelineMaxEvents
  };
}
