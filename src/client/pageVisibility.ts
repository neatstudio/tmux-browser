type PageVisibilityTarget = Pick<Document, "visibilityState">;

export function isPageVisible(target: PageVisibilityTarget = document) {
  return target.visibilityState !== "hidden";
}
