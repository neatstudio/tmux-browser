export type ImageUploadResponse = {
  ok: true;
  absolutePath: string;
  contentType: string;
  size: number;
};

export function getImageFileFromItems(items: DataTransferItemList | undefined) {
  if (!items) {
    return null;
  }

  for (const item of Array.from(items)) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) {
      continue;
    }

    const file = item.getAsFile();

    if (file) {
      return file;
    }
  }

  return null;
}

export function getImageFileFromFiles(files: FileList | undefined) {
  if (!files) {
    return null;
  }

  return Array.from(files).find((file) => file.type.startsWith("image/")) ?? null;
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
