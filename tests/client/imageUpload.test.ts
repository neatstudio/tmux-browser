import { describe, expect, it, vi } from "vitest";

import {
  getImageUrlFromDataTransfer,
  getImageFileFromFiles,
  getImageFileFromItems,
  hasImageFileCandidate,
  hasImageUrlCandidate,
  uploadImageForSession,
  uploadImageUrlForSession
} from "../../src/client/imageUpload";

describe("image upload helpers", () => {
  it("selects the first real image file from mobile file pickers", () => {
    const image = new File([new Uint8Array([1])], "shot.png", {
      type: "image/png"
    });
    const text = new File(["x"], "note.txt", {
      type: "text/plain"
    });

    expect(getImageFileFromFiles({ 0: text, 1: image, length: 2, item: () => null } as FileList)).toBe(image);
  });

  it("accepts dragged image files when the browser leaves the MIME type empty", () => {
    const image = new File([new Uint8Array([1])], "desktop-shot.png", {
      type: ""
    });
    const text = new File(["x"], "note.txt", {
      type: ""
    });

    expect(getImageFileFromFiles({ 0: text, 1: image, length: 2, item: () => null } as FileList)).toBe(image);
  });

  it("ignores clipboard/drop entries that are not image files", () => {
    const image = new File([new Uint8Array([1])], "shot.webp", {
      type: "image/webp"
    });
    const items = [
      { kind: "string", type: "text/plain", getAsFile: () => null },
      { kind: "file", type: "application/pdf", getAsFile: () => new File(["x"], "x.pdf") },
      { kind: "file", type: "image/webp", getAsFile: () => image }
    ] as unknown as DataTransferItemList;

    expect(getImageFileFromItems(items)).toBe(image);
  });

  it("accepts drag items with empty MIME type when the file extension is image-like", () => {
    const image = new File([new Uint8Array([1])], "desktop-shot.jpg", {
      type: ""
    });
    const items = [
      { kind: "file", type: "", getAsFile: () => new File(["x"], "note.txt", { type: "" }) },
      { kind: "file", type: "", getAsFile: () => image }
    ] as unknown as DataTransferItemList;

    expect(getImageFileFromItems(items)).toBe(image);
  });

  it("allows dragover for file items that do not expose a file until drop", () => {
    const items = [
      { kind: "file", type: "", getAsFile: () => null }
    ] as unknown as DataTransferItemList;

    expect(hasImageFileCandidate({ items, files: undefined })).toBe(true);
  });

  it("extracts a dropped web image url from uri-list data", async () => {
    const dataTransfer = {
      items: [
        {
          kind: "string",
          type: "text/uri-list",
          getAsString: (callback: (value: string) => void) =>
            callback("# source\nhttps://img.example.test/shot.png\n")
        }
      ],
      types: ["text/uri-list"]
    } as unknown as DataTransfer;

    await expect(getImageUrlFromDataTransfer(dataTransfer)).resolves.toBe(
      "https://img.example.test/shot.png"
    );
    expect(hasImageUrlCandidate(dataTransfer)).toBe(true);
  });

  it("extracts a dropped web image url from html img data", async () => {
    const dataTransfer = {
      items: [
        {
          kind: "string",
          type: "text/html",
          getAsString: (callback: (value: string) => void) =>
            callback('<img alt="poster" src="https://cdn.example.test/a/b.jpg?token=1">')
        }
      ],
      types: ["text/html"]
    } as unknown as DataTransfer;

    await expect(getImageUrlFromDataTransfer(dataTransfer)).resolves.toBe(
      "https://cdn.example.test/a/b.jpg?token=1"
    );
    expect(hasImageUrlCandidate(dataTransfer)).toBe(true);
  });

  it("allows dragover for plain text url candidates before drop data is readable", () => {
    const dataTransfer = {
      items: [],
      types: ["text/plain"],
      getData: () => ""
    } as unknown as DataTransfer;

    expect(hasImageUrlCandidate(dataTransfer)).toBe(true);
  });

  it("uploads an image for a tmux session and returns the saved path", async () => {
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "shot.png", {
      type: "image/png"
    });
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          ok: true,
          absolutePath: "/Users/gouki/.tmux-ui/uploads/build/shot.png",
          contentType: "image/png",
          size: 4
        })
    });
    vi.stubGlobal("fetch", fetch);

    const upload = await uploadImageForSession("build", file);

    expect(upload.absolutePath).toBe("/Users/gouki/.tmux-ui/uploads/build/shot.png");
    expect(fetch).toHaveBeenCalledWith("/api/uploads/image", {
      method: "POST",
      headers: {
        "Content-Type": "image/png",
        "X-Tmux-Session": "build"
      },
      body: file
    });
  });

  it("uploads a web image url for a tmux session and returns the saved path", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          ok: true,
          absolutePath: "/Users/gouki/.tmux-ui/uploads/build/web.png",
          contentType: "image/png",
          size: 8
        })
    });
    vi.stubGlobal("fetch", fetch);

    const upload = await uploadImageUrlForSession(
      "build",
      "https://img.example.test/web.png"
    );

    expect(upload.absolutePath).toBe("/Users/gouki/.tmux-ui/uploads/build/web.png");
    expect(fetch).toHaveBeenCalledWith("/api/uploads/image-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tmux-Session": "build"
      },
      body: JSON.stringify({
        url: "https://img.example.test/web.png"
      })
    });
  });
});
