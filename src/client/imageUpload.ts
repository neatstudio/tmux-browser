export type ImageUploadResponse = {
  ok: true;
  absolutePath: string;
  contentType: string;
  size: number;
};

const IMAGE_FILE_EXTENSION_PATTERN =
  /\.(?:apng|avif|gif|jpe?g|png|svg|webp)$/i;
const URL_TEXT_TYPES = new Set([
  "text/uri-list",
  "text/html",
  "text/plain",
  "text/x-moz-url"
]);

function isImageFileLike(file: File) {
  return (
    file.type.startsWith("image/") ||
    (file.type === "" && IMAGE_FILE_EXTENSION_PATTERN.test(file.name))
  );
}

export function getImageFileFromItems(items: DataTransferItemList | undefined) {
  if (!items) {
    return null;
  }

  for (const item of Array.from(items)) {
    if (
      item.kind !== "file" ||
      (item.type !== "" && !item.type.startsWith("image/"))
    ) {
      continue;
    }

    const file = item.getAsFile();

    if (file && isImageFileLike(file)) {
      return file;
    }
  }

  return null;
}

export function getImageFileFromFiles(files: FileList | undefined) {
  if (!files) {
    return null;
  }

  return Array.from(files).find(isImageFileLike) ?? null;
}

export function hasImageFileCandidate(input: {
  items?: DataTransferItemList;
  files?: FileList;
}) {
  if (getImageFileFromItems(input.items) || getImageFileFromFiles(input.files)) {
    return true;
  }

  return Array.from(input.items ?? []).some(
    (item) =>
      item.kind === "file" &&
      (item.type === "" || item.type.startsWith("image/"))
  );
}

function normalizeHttpUrl(value: string) {
  try {
    const url = new URL(value.trim());

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
}

function getFirstHttpUrlFromText(value: string) {
  const match = value.match(/https?:\/\/[^\s"'<>]+/i);

  return match ? normalizeHttpUrl(match[0]) : null;
}

function getFirstUrlFromUriList(value: string) {
  for (const line of value.split(/\r?\n/)) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const url = normalizeHttpUrl(trimmedLine);

    if (url) {
      return url;
    }
  }

  return null;
}

function getFirstImageUrlFromHtml(value: string) {
  if (typeof DOMParser !== "undefined") {
    const document = new DOMParser().parseFromString(value, "text/html");
    const imageSource = document.querySelector("img[src]")?.getAttribute("src");
    const imageUrl = imageSource ? normalizeHttpUrl(imageSource) : null;

    if (imageUrl) {
      return imageUrl;
    }
  }

  const imageSource = value.match(/<img\b[^>]*\bsrc=["']?([^"'\s>]+)/i)?.[1];
  const imageUrl = imageSource ? normalizeHttpUrl(imageSource) : null;

  return imageUrl ?? getFirstHttpUrlFromText(value);
}

function getFirstUrlByType(type: string, value: string) {
  if (type === "text/uri-list" || type === "text/x-moz-url") {
    return getFirstUrlFromUriList(value) ?? getFirstHttpUrlFromText(value);
  }

  if (type === "text/html") {
    return getFirstImageUrlFromHtml(value);
  }

  return getFirstHttpUrlFromText(value);
}

function readStringItem(item: DataTransferItem) {
  return new Promise<string>((resolve) => {
    let resolved = false;
    const finish = (value: string) => {
      if (resolved) {
        return;
      }

      resolved = true;
      resolve(value);
    };

    try {
      item.getAsString((value) => finish(value ?? ""));
    } catch {
      finish("");
    }

    window.setTimeout(() => finish(""), 250);
  });
}

export function hasImageUrlCandidate(dataTransfer: DataTransfer | undefined) {
  if (!dataTransfer) {
    return false;
  }

  if (
    Array.from(dataTransfer.types ?? []).some((type) => {
      return URL_TEXT_TYPES.has(type);
    })
  ) {
    return true;
  }

  return Array.from(dataTransfer.items ?? []).some(
    (item) => item.kind === "string" && URL_TEXT_TYPES.has(item.type)
  );
}

export async function getImageUrlFromDataTransfer(
  dataTransfer: DataTransfer | undefined
) {
  if (!dataTransfer) {
    return null;
  }

  for (const type of ["text/uri-list", "text/html", "text/x-moz-url", "text/plain"]) {
    const value = dataTransfer.getData?.(type) ?? "";
    const url = value ? getFirstUrlByType(type, value) : null;

    if (url) {
      return url;
    }
  }

  for (const item of Array.from(dataTransfer.items ?? [])) {
    if (item.kind !== "string" || !URL_TEXT_TYPES.has(item.type)) {
      continue;
    }

    const value = await readStringItem(item);
    const url = getFirstUrlByType(item.type, value);

    if (url) {
      return url;
    }
  }

  return null;
}

export async function uploadImageForSession(sessionName: string, file: File) {
  const response = await fetch("/api/uploads/image", {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-Tmux-Session": sessionName
    },
    body: file
  });

  if (!response.ok) {
    throw new Error(`Upload failed with ${response.status}`);
  }

  return (await response.json()) as ImageUploadResponse;
}

export async function uploadImageUrlForSession(sessionName: string, url: string) {
  const response = await fetch("/api/uploads/image-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tmux-Session": sessionName
    },
    body: JSON.stringify({ url })
  });

  if (!response.ok) {
    throw new Error(`Upload failed with ${response.status}`);
  }

  return (await response.json()) as ImageUploadResponse;
}
