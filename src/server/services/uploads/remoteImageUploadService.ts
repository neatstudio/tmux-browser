import { lookup as defaultLookup } from "node:dns/promises";
import { isIP } from "node:net";

import { ImageUploadError } from "./imageUploadService.js";

const MAX_REMOTE_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_REMOTE_REDIRECTS = 3;

type LookupAddress = {
  address: string;
};

type FetchResponse = {
  ok: boolean;
  status: number;
  headers: {
    get: (name: string) => string | null;
  };
  body?: ReadableStream<Uint8Array> | null;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

export type RemoteImageFetchDeps = {
  fetch?: (url: string, init?: RequestInit) => Promise<FetchResponse>;
  lookup?: (
    hostname: string,
    options: { all: true }
  ) => Promise<LookupAddress[]>;
};

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map((part) => Number(part));

  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return true;
  }

  const [first, second] = parts;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first === 169 && second === 254 ||
    first === 172 && second >= 16 && second <= 31 ||
    first === 192 && second === 168 ||
    first === 100 && second >= 64 && second <= 127 ||
    first >= 224
  );
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase();
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];

  return mappedIpv4 ? isPrivateIpv4(mappedIpv4) : (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  );
}

async function readRemoteImageBody(response: FetchResponse) {
  if (!response.body) {
    return Buffer.from(await response.arrayBuffer());
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      totalBytes += value.byteLength;

      if (totalBytes > MAX_REMOTE_IMAGE_BYTES) {
        await reader.cancel();
        throw new ImageUploadError("Remote image is too large", 413);
      }

      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, totalBytes);
}

function isAllowedAddress(address: string) {
  const ipVersion = isIP(address);

  if (ipVersion === 4) {
    return !isPrivateIpv4(address);
  }

  if (ipVersion === 6) {
    return !isPrivateIpv6(address);
  }

  return false;
}

function parseRemoteImageUrl(url: string) {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    throw new ImageUploadError("Invalid remote image url", 400);
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new ImageUploadError("Remote image url must be http or https", 400);
  }

  if (!parsedUrl.hostname) {
    throw new ImageUploadError("Remote image url is missing a host", 400);
  }

  return parsedUrl;
}

async function assertAllowedRemoteHost(
  parsedUrl: URL,
  lookup: NonNullable<RemoteImageFetchDeps["lookup"]>
) {
  const addresses = await lookup(parsedUrl.hostname, { all: true });

  if (addresses.length === 0 || addresses.some((entry) => !isAllowedAddress(entry.address))) {
    throw new ImageUploadError("Remote image host is not allowed", 403);
  }
}

export async function fetchRemoteImage(
  url: string,
  deps: RemoteImageFetchDeps = {}
): Promise<Buffer> {
  const fetchImpl = deps.fetch ?? fetch;
  const lookup = deps.lookup ?? defaultLookup;
  let currentUrl = parseRemoteImageUrl(url);

  for (let redirectCount = 0; redirectCount <= MAX_REMOTE_REDIRECTS; redirectCount += 1) {
    await assertAllowedRemoteHost(currentUrl, lookup);

    const response = await fetchImpl(currentUrl.href, {
      redirect: "manual"
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");

      if (!location) {
        throw new ImageUploadError("Remote image redirect is missing a location", 502);
      }

      currentUrl = parseRemoteImageUrl(new URL(location, currentUrl).href);
      continue;
    }

    if (!response.ok) {
      throw new ImageUploadError(`Remote image request failed with ${response.status}`, 502);
    }

    const contentLength = Number(response.headers.get("content-length") ?? "0");

    if (contentLength > MAX_REMOTE_IMAGE_BYTES) {
      throw new ImageUploadError("Remote image is too large", 413);
    }

    const buffer = await readRemoteImageBody(response);

    if (buffer.length > MAX_REMOTE_IMAGE_BYTES) {
      throw new ImageUploadError("Remote image is too large", 413);
    }

    return buffer;
  }

  throw new ImageUploadError("Remote image has too many redirects", 508);
}
