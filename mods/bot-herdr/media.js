// Pictures for the chat, kept once per content: mockups (HTML an agent wrote, drawn by a browser
// the person already has: `bh mockup`), and images pasted or attached (copied where herdr can
// show them: `bh clip`, `bh preview`). Each comes back as a path for image().

import * as fs from "fs/promises";
import { appHome } from "herdr";
import { bh } from "./bh.js";
import { hash } from "./feed.js";

const DRAW_MS = 60000;
/** key → { state: "drawing" | "ready" | "failed", image, html, error } */
const cache = new Map();

const dataDir = () => `${appHome().replace(/\\/g, "/")}/data/bot-herdr`;

function parse(r) {
  try {
    return JSON.parse(r.stdout);
  } catch {
    return null;
  }
}

/** A mockup's picture: ready, still drawing, or failed (with why). Starts drawing it once. */
function draw(key, file, write, cx) {
  const known = cache.get(key);
  if (known) return known;
  const entry = { state: "drawing", image: null, html: file, error: null };
  cache.set(key, entry);
  cx.spawn(async (cx) => {
    try {
      if (write) {
        await fs.mkdir(`${dataDir()}/mockups`, { recursive: true });
        if (!(await fs.exists(file))) await fs.writeFile(file, write);
      }
      const got = parse(await bh(["mockup", file, "--json"], { timeout: DRAW_MS }));
      if (got?.image) Object.assign(entry, { state: "ready", image: got.image });
      else Object.assign(entry, { state: "failed", error: got?.error ?? "The mockup couldn't be drawn." });
    } catch (e) {
      Object.assign(entry, { state: "failed", error: String(e?.message ?? e) });
    }
    cx.notify();
  });
  return entry;
}

/** A mockup from its HTML (a ```mockup block in a reply). */
export function mockup(html, cx) {
  const id = hash(html);
  return draw(`html:${id}`, `${dataDir()}/mockups/m-${id}.html`, html, cx);
}

/** A mockup kept as a file (a question's option). */
export function mockupFile(file, cx) {
  return draw(`file:${file}`, file, null, cx);
}

/** Opens a mockup's page in the person's browser. */
export function openInBrowser(file, cx) {
  cx.spawn(async () => {
    await bh(["open", file]);
  });
}

/** What a paste with no text held: images or files, each { file, image? }. */
export async function fromClipboard() {
  const got = parse(await bh(["clip", "--json"], { timeout: 20000 }));
  return Array.isArray(got) ? got : [];
}

/** Image files as herdr can show them: { file, image } or { file, error }. */
export async function previews(files) {
  if (!files.length) return [];
  const got = parse(await bh(["preview", ...files, "--json"], { timeout: 20000 }));
  return Array.isArray(got) ? got : files.map((file) => ({ file, error: "No preview." }));
}

export const isImage = (path) => /\.(png|jpe?g|gif|webp|bmp)$/i.test(String(path ?? ""));
