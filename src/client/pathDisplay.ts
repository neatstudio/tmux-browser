export function formatDisplayPath(
  path: string | null | undefined,
  homeDirectory: string | null | undefined
) {
  if (!path) {
    return "path unavailable";
  }

  if (!homeDirectory || homeDirectory === "/") {
    return path;
  }

  const normalizedHome =
    homeDirectory.endsWith("/") && homeDirectory !== "/"
      ? homeDirectory.slice(0, -1)
      : homeDirectory;

  if (path === normalizedHome) {
    return "~";
  }

  if (path.startsWith(`${normalizedHome}/`)) {
    return `~${path.slice(normalizedHome.length)}`;
  }

  return path;
}
