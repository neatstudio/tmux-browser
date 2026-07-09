export function formatDisplayPath(
  path: string | null | undefined,
  homeDirectory: string | null | undefined
) {
  if (!path) {
    return "path unavailable";
  }

  const normalizedHome = getNormalizedHomeDirectory(path, homeDirectory);

  if (!normalizedHome) {
    return path;
  }

  if (path === normalizedHome) {
    return "~";
  }

  if (path.startsWith(`${normalizedHome}/`)) {
    return `~${path.slice(normalizedHome.length)}`;
  }

  return path;
}

function getNormalizedHomeDirectory(
  path: string,
  homeDirectory: string | null | undefined
) {
  if (homeDirectory && homeDirectory !== "/") {
    return homeDirectory.endsWith("/") ? homeDirectory.slice(0, -1) : homeDirectory;
  }

  return inferCommonHomeDirectory(path);
}

function inferCommonHomeDirectory(path: string) {
  return path.match(/^\/(?:Users|home)\/[^/]+(?=\/|$)/)?.[0] ?? null;
}
