export type ImageUploadResponse = {
  ok: true;
  absolutePath: string;
  contentType: string;
  size: number;
};

const IMAGE_FILE_EXTENSION_PATTERN =
  /\.(?:apng|avif|gif|jpe?g|png|svg|webp)$/i;

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
