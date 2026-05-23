const IMAGE_PATH_PATTERN =
  /(?:~\/|\/|\.{1,2}\/)?[^\s'"<>|]+?\.(?:png|jpe?g|gif|webp|svg|avif|apng)(?:\?[^\s'"<>|]*)?/gi;

function normalizeImagePathCandidate(value: string) {
  return value.replace(/[),.;:]+$/g, "");
}

export function getVisibleImagePaths(visibleText: string) {
  const paths = new Set<string>();
  let match: RegExpExecArray | null;

  IMAGE_PATH_PATTERN.lastIndex = 0;

  while ((match = IMAGE_PATH_PATTERN.exec(visibleText))) {
    const candidate = normalizeImagePathCandidate(match[0] ?? "");

    if (candidate) {
      paths.add(candidate);
    }
  }

  return [...paths];
}
