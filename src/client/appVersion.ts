export type AppHealth = {
  version: string;
};

function parseVersionParts(version: string) {
  return version
    .trim()
    .replace(/^v/i, "")
    .split(/[.-]/)
    .map((part) => {
      const value = Number(part);

      return Number.isFinite(value) ? value : 0;
    });
}

export function isServerVersionNewer(
  serverVersion: string,
  clientVersion: string
) {
  const serverParts = parseVersionParts(serverVersion);
  const clientParts = parseVersionParts(clientVersion);
  const length = Math.max(serverParts.length, clientParts.length);

  for (let index = 0; index < length; index += 1) {
    const serverPart = serverParts[index] ?? 0;
    const clientPart = clientParts[index] ?? 0;

    if (serverPart > clientPart) {
      return true;
    }

    if (serverPart < clientPart) {
      return false;
    }
  }

  return false;
}

export async function fetchAppHealth(baseUrl = "") {
  const response = await fetch(`${baseUrl}/api/health`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Failed to load app health");
  }

  return (await response.json()) as AppHealth;
}
