import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  isLocalImage,
  imageExt,
  imageBaseName,
  downloadImage,
  restoreInstagramImages,
} from "../../docs/.vitepress/instagram-images.js";

const image = (type = "image/jpeg", body = "abc") =>
  new Response(body, { status: 200, headers: { "content-type": type } });

let root;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ig-"));
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("isLocalImage", () => {
  it("accepts flat files inside /instagram/", () => {
    expect(isLocalImage("/instagram/abc_123.jpg")).toBe(true);
    expect(isLocalImage("/instagram/abc.webp")).toBe(true);
  });

  it("rejects remote URLs, traversal, subdirectories and non-images", () => {
    expect(isLocalImage("https://scontent.cdninstagram.com/x.jpg")).toBe(false);
    expect(isLocalImage("/instagram/../config.json")).toBe(false);
    expect(isLocalImage("/instagram/a/b.jpg")).toBe(false);
    expect(isLocalImage("/instagram/x.html")).toBe(false);
    expect(isLocalImage("")).toBe(false);
    expect(isLocalImage(null)).toBe(false);
  });
});

describe("imageExt", () => {
  it("maps content types", () => {
    expect(imageExt("image/jpeg")).toBe("jpg");
    expect(imageExt("image/webp; charset=binary")).toBe("webp");
    expect(imageExt("image/png")).toBe("png");
  });

  it("rejects non-image types", () => {
    expect(imageExt("text/html", "https://x.test/a.jpg")).toBeNull();
  });

  it("falls back to the URL extension only when the type is missing/generic", () => {
    expect(imageExt("", "https://x.test/a/b.jpeg?sig=1")).toBe("jpg");
    expect(imageExt("application/octet-stream", "https://x.test/a.png")).toBe("png");
    expect(imageExt("", "https://x.test/noext")).toBeNull();
  });
});

describe("imageBaseName", () => {
  it("uses a sanitized videoId", () => {
    expect(imageBaseName({ videoId: "18_abc-9" })).toBe("18_abc-9");
    expect(imageBaseName({ videoId: "../x/y" })).toBe("xy");
  });

  it("falls back to a stable hash of the url", () => {
    const a = imageBaseName({ videoId: null, url: "https://i.test/p/1/embed/" });
    expect(a).toMatch(/^[a-f0-9]{16}$/);
    expect(imageBaseName({ url: "https://i.test/p/1/embed/" })).toBe(a);
  });
});

describe("downloadImage", () => {
  it("saves the image and returns its site path", async () => {
    const fetchImpl = vi.fn(async () => image("image/jpeg", "pixels"));
    const rel = await downloadImage("https://cdn.test/a.jpg?sig=1", "post1", { root, fetchImpl });
    expect(rel).toBe("/instagram/post1.jpg");
    expect(fs.readFileSync(path.join(root, rel), "utf8")).toBe("pixels");
    // bypasses createFiles.js's JSON-cache fetch patch
    expect(fetchImpl).toHaveBeenCalledWith("https://cdn.test/a.jpg?sig=1", { cache: "no-cache" });
  });

  it("returns null (never throws) on HTTP errors, non-images and non-https URLs", async () => {
    const notFound = vi.fn(async () => new Response("x", { status: 403 }));
    expect(await downloadImage("https://cdn.test/a.jpg", "p", { root, fetchImpl: notFound })).toBeNull();

    const html = vi.fn(async () => image("text/html"));
    expect(await downloadImage("https://cdn.test/a.jpg", "p", { root, fetchImpl: html })).toBeNull();

    const never = vi.fn();
    expect(await downloadImage("http://cdn.test/a.jpg", "p", { root, fetchImpl: never })).toBeNull();
    expect(await downloadImage("/instagram/p.jpg", "p", { root, fetchImpl: never })).toBeNull();
    expect(never).not.toHaveBeenCalled();

    const boom = vi.fn(async () => {
      throw new Error("network");
    });
    expect(await downloadImage("https://cdn.test/a.jpg", "p", { root, fetchImpl: boom })).toBeNull();
    expect(fs.existsSync(path.join(root, "instagram"))).toBe(false);
  });
});

describe("restoreInstagramImages", () => {
  it("restores only missing, valid local images from the live site", async () => {
    fs.mkdirSync(path.join(root, "instagram"), { recursive: true });
    fs.writeFileSync(path.join(root, "instagram/have.jpg"), "x");

    const fetchImpl = vi.fn(async (url) =>
      url === "https://site.test/instagram/a.jpg" ? image() : new Response("nope", { status: 404 }),
    );
    const items = [
      { image: "/instagram/a.jpg" },
      { image: "/instagram/a.jpg" }, // duplicate
      { image: "/instagram/have.jpg" }, // already on disk
      { image: "/instagram/gone.jpg" }, // 404 on the site
      { image: "/instagram/../../etc/passwd" }, // traversal
      { image: "https://cdn.test/legacy.jpg" }, // legacy remote URL
      { image: "" },
      null,
    ];

    const n = await restoreInstagramImages("https://site.test", items, { root, fetchImpl });

    expect(n).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2); // a.jpg + gone.jpg only
    expect(fs.existsSync(path.join(root, "instagram/a.jpg"))).toBe(true);
    expect(fs.existsSync(path.join(root, "instagram/gone.jpg"))).toBe(false);
  });

  it("does not save a 200 response that is not an image", async () => {
    const fetchImpl = vi.fn(async () => image("text/html", "<html>"));
    const n = await restoreInstagramImages("https://site.test", [{ image: "/instagram/a.jpg" }], { root, fetchImpl });
    expect(n).toBe(0);
    expect(fs.existsSync(path.join(root, "instagram/a.jpg"))).toBe(false);
  });

  it("tolerates a non-array instagram.json", async () => {
    const fetchImpl = vi.fn();
    expect(await restoreInstagramImages("https://site.test", {}, { root, fetchImpl })).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
