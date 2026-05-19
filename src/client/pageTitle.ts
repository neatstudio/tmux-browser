export function getShortHostLabel(hostname: string) {
  const trimmedHostname = hostname.trim();
  const ipv4Match = trimmedHostname.match(/^(?:\d{1,3}\.){3}(\d{1,3})$/);

  if (ipv4Match) {
    return ipv4Match[1]!;
  }

  if (trimmedHostname === "localhost") {
    return "local";
  }

  return trimmedHostname.split(".")[0] || "host";
}

export function getCompactPageTitle(hostname: string, version?: string) {
  const trimmedVersion = version?.trim();
  const versionSuffix = trimmedVersion ? ` v${trimmedVersion}` : "";

  return `BTD(${getShortHostLabel(hostname)})${versionSuffix}`;
}
