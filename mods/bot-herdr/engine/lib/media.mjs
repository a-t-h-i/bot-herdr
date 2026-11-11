// Pictures for the chat: mockups drawn by a browser the person already has (Chrome, Edge,
// Chromium or Brave, headless), images pasted from the clipboard, and copies of image files so
// herdr can show them (it shows images from its own folder only).
//
// Everything is kept under <app home>/data/bot-herdr: mockups/, pasted/, previews/.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { APP_HOME, DATA, ensureDir } from "./core.mjs";

export const WIDTH = 1200;
export const HEIGHT = 825; // 16:11, the shape of a mockup's thumbnail
export const IMAGE = /\.(png|jpe?g|gif|webp|bmp)$/i;
const MAX_BYTES = 15 * 1024 * 1024; // herdr shows images up to 16 MB

/** A path under the app home as herdr's image() takes it: relative, with forward slashes. */
export const appPath = (file) => relative(APP_HOME, file).split(/[\\/]/).join("/");

/** A mockup as a whole page: a fragment (`<style>` and some markup) gets a document around it. */
export function page(html, title = "Mockup") {
  if (/<html[\s>]/i.test(html)) return html;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/</g, "&lt;")}</title><style>html,body{margin:0;background:#fff}body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif}</style></head><body>${html}</body></html>`;
}

/** A browser that can draw a page headless, or null. BH_BROWSER picks one. */
export function findBrowser({ env = process.env, platform = process.platform, exists = existsSync, which = whichOnPath } = {}) {
  if (env.BH_BROWSER) return exists(env.BH_BROWSER) ? env.BH_BROWSER : which(env.BH_BROWSER, env);
  if (platform === "win32") {
    const roots = [env.PROGRAMFILES, env["PROGRAMFILES(X86)"], env.LOCALAPPDATA].filter(Boolean);
    const apps = ["Microsoft\\Edge\\Application\\msedge.exe", "Google\\Chrome\\Application\\chrome.exe", "BraveSoftware\\Brave-Browser\\Application\\brave.exe", "Chromium\\Application\\chrome.exe"];
    for (const app of apps) for (const root of roots) if (exists(join(root, app))) return join(root, app);
    return null;
  }
  if (platform === "darwin") {
    const apps = ["Google Chrome.app/Contents/MacOS/Google Chrome", "Microsoft Edge.app/Contents/MacOS/Microsoft Edge", "Chromium.app/Contents/MacOS/Chromium", "Brave Browser.app/Contents/MacOS/Brave Browser"];
    for (const app of apps) for (const root of ["/Applications", join(env.HOME ?? "", "Applications")]) if (exists(join(root, app))) return join(root, app);
    return null;
  }
  for (const name of ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "microsoft-edge", "brave-browser"]) {
    const found = which(name, env);
    if (found) return found;
  }
  return null;
}

function whichOnPath(name, env = process.env) {
  for (const dir of String(env.PATH ?? "").split(process.platform === "win32" ? ";" : ":")) {
    if (!dir) continue;
    for (const ext of process.platform === "win32" ? [".exe", ""] : [""]) {
      const file = join(dir, name + ext);
      if (existsSync(file)) return file;
    }
  }
  return null;
}

/** The browser's arguments for one screenshot. A fresh profile, so a browser already open isn't asked instead. */
export function screenshotArgs(htmlFile, pngFile, profile, { width = WIDTH, height = HEIGHT, sandbox = true } = {}) {
  return [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check",
    "--disable-extensions", "--mute-audio", "--force-device-scale-factor=1", `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`, `--screenshot=${pngFile}`, "--virtual-time-budget=2500",
    ...(sandbox ? [] : ["--no-sandbox"]),
    pathToFileURL(htmlFile).href,
  ];
}

/**
 * Draws a mockup's page to a PNG beside it (`<name>.png`), once: a drawn one is reused.
 * Returns { png, image } (image: the path herdr's image() takes) or { error }.
 */
export function drawMockup(htmlFile, { force = false } = {}) {
  const png = htmlFile.replace(/\.html?$/i, "") + ".png";
  if (!force && existsSync(png) && statSync(png).mtimeMs >= statSync(htmlFile).mtimeMs) return { png, image: appPath(png) };
  const browser = findBrowser();
  if (!browser) return { error: "No Chrome, Edge, Chromium or Brave found to draw mockups with. Install one, or set BH_BROWSER to one." };
  // A fragment is drawn from a whole page next to it.
  const source = readFileSync(htmlFile, "utf8");
  let file = htmlFile;
  if (!/<html[\s>]/i.test(source)) {
    file = htmlFile.replace(/\.html?$/i, "") + ".page.html";
    writeFileSync(file, page(source));
  }
  const profile = mkdtempSync(join(tmpdir(), "bh-mockup-"));
  try {
    const root = process.platform === "linux" && process.getuid?.() === 0;
    const r = spawnSync(browser, screenshotArgs(file, png, profile, { sandbox: !root }), { timeout: 45000, stdio: ["ignore", "ignore", "pipe"], encoding: "utf8", windowsHide: true });
    if (!existsSync(png)) return { error: `The browser didn't draw it${r.error ? `: ${r.error.message}` : r.stderr ? `: ${String(r.stderr).trim().split("\n").pop()}` : "."}` };
    return { png, image: appPath(png) };
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
}

/** A mockup's HTML kept by its content (the chat's mockups), drawn. */
export function drawHtml(html) {
  const dir = ensureDir(join(DATA, "mockups"));
  const id = createHash("sha1").update(html).digest("hex").slice(0, 16);
  const file = join(dir, `${id}.html`);
  if (!existsSync(file)) writeFileSync(file, page(html));
  return { html: file, ...drawMockup(file) };
}

/** An image file as herdr can show it: itself when under the app home, else a copy kept by its content. */
export function preview(file) {
  if (!IMAGE.test(file) || !existsSync(file)) return { error: "Not an image." };
  const size = statSync(file).size;
  if (size > MAX_BYTES) return { error: "Too large to preview." };
  const rel = relative(APP_HOME, file);
  if (!rel.startsWith("..") && !/^[a-z]:/i.test(rel)) return { image: appPath(file), file };
  const dir = ensureDir(join(DATA, "previews"));
  const id = createHash("sha1").update(readFileSync(file)).digest("hex").slice(0, 16);
  const copy = join(dir, `${id}${extname(file).toLowerCase()}`);
  if (!existsSync(copy)) copyFileSync(file, copy);
  return { image: appPath(copy), file };
}

/**
 * What the clipboard holds that isn't text: an image (saved as a PNG under pasted/) or files
 * copied in the file manager. Returns { files: [paths] }, empty when it holds neither.
 */
export function clipboard({ platform = process.platform, run = spawnSync } = {}) {
  const dir = ensureDir(join(DATA, "pasted"));
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "").replace("T", "-");
  const out = join(dir, `pasted-${stamp}.png`);
  const opts = { encoding: "utf8", timeout: 15000, windowsHide: true };
  if (platform === "win32") {
    const script = [
      "Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing;",
      "if ([System.Windows.Forms.Clipboard]::ContainsFileDropList()) { [System.Windows.Forms.Clipboard]::GetFileDropList() | ForEach-Object { 'file:' + $_ } }",
      "elseif ([System.Windows.Forms.Clipboard]::ContainsImage()) { $i = [System.Windows.Forms.Clipboard]::GetImage(); $i.Save($env:BH_OUT, [System.Drawing.Imaging.ImageFormat]::Png); 'image:' + $env:BH_OUT }",
    ].join(" ");
    const r = run("powershell", ["-NoProfile", "-NonInteractive", "-STA", "-Command", script], { ...opts, env: { ...process.env, BH_OUT: out } });
    return { files: String(r.stdout ?? "").split(/\r?\n/).map((l) => /^(?:file|image):(.+)$/.exec(l.trim())?.[1]).filter(Boolean) };
  }
  if (platform === "darwin") {
    const image = run("osascript", ["-e", "try", "-e", "set d to (the clipboard as «class PNGf»)", "-e", `set f to open for access (POSIX file ${JSON.stringify(out)}) with write permission`, "-e", "set eof f to 0", "-e", "write d to f", "-e", "close access f", "-e", "return \"image\"", "-e", "on error", "-e", "return \"\"", "-e", "end try"], opts);
    if (String(image.stdout ?? "").trim() === "image" && existsSync(out)) return { files: [out] };
    const files = run("osascript", ["-e", "try", "-e", "set out to \"\"", "-e", "repeat with f in (the clipboard as «class furl» as list)", "-e", "set out to out & POSIX path of f & linefeed", "-e", "end repeat", "-e", "return out", "-e", "on error", "-e", "return \"\"", "-e", "end try"], opts);
    return { files: String(files.stdout ?? "").split("\n").map((s) => s.trim()).filter(Boolean) };
  }
  for (const [cmd, args] of [["wl-paste", ["--no-newline", "--type", "image/png"]], ["xclip", ["-selection", "clipboard", "-t", "image/png", "-o"]]]) {
    const r = run(cmd, args, { ...opts, encoding: "buffer" });
    if (r.status === 0 && r.stdout?.length > 8 && r.stdout[0] === 0x89) {
      writeFileSync(out, r.stdout);
      return { files: [out] };
    }
  }
  return { files: [] };
}
