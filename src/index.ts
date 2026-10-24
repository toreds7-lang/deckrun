#!/usr/bin/env node
import { readFileSync, writeFileSync, watch } from "fs";
import { readFile } from "fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { createRequire } from "module";
import { resolve, dirname, basename, extname, join, isAbsolute, relative } from "path";
import { Command } from "commander";
import open from "open";
import { parseSlides, type Slide } from "./parser.js";
import { generateHtml, generateDocHtml, renderSlide } from "./generate.js";
import {
  DEFAULT_THEME,
  findFont,
  findTheme,
  fontListing,
  resolveThemeName,
  themeListing,
  type ThemeName,
} from "./themes.js";
import { generateEditorHtml } from "./editor.js";
import { generatePreviewHtml } from "./preview.js";
import { findBrowser, renderPdfSerial, renderPngSerial, PdfError } from "./pdf.js";
import { chatBlockedReason, chatBusy, chatCheck, chatModelOk, findClaude, resetChat, runChatTurn, stopChat } from "./chat.js";
import { deckKind, isDeckName, listDecks, saveUpload, type UploadResult } from "./folder.js";
import {
  DEFAULT_TEMPLATE,
  DEFAULT_TRANSITION,
  findTemplate,
  findTransition,
  resolveTemplateName,
  resolveTransitionName,
  templateListing,
  transitionListing,
  type TemplateName,
  type TransitionName,
} from "./presentation-options.js";
import { lintMarkdown, type LintIssue } from "./lint.js";

const moduleRequire = createRequire(import.meta.url);

const c = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  cyan:   "\x1b[36m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  magenta:"\x1b[35m",
};

function packageVersion(): string {
  try {
    return moduleRequire("../package.json").version as string;
  } catch {
    return "0.0.0";
  }
}

const MIME: Record<string, string> = {
  ".html":  "text/html; charset=utf-8",
  ".htm":   "text/html; charset=utf-8",
  ".css":   "text/css",
  ".js":    "application/javascript",
  ".mjs":   "application/javascript",
  ".json":  "application/json",
  ".md":    "text/markdown; charset=utf-8",
  ".txt":   "text/plain; charset=utf-8",
  ".png":   "image/png",
  ".jpg":   "image/jpeg",
  ".jpeg":  "image/jpeg",
  ".gif":   "image/gif",
  ".svg":   "image/svg+xml",
  ".webp":  "image/webp",
  ".ico":   "image/x-icon",
  ".avif":  "image/avif",
  ".mp4":   "video/mp4",
  ".webm":  "video/webm",
  ".mov":   "video/quicktime",
  ".mp3":   "audio/mpeg",
  ".wav":   "audio/wav",
  ".ogg":   "audio/ogg",
  ".m4a":   "audio/mp4",
  ".bmp":   "image/bmp",
  ".pdf":   "application/pdf",
  ".woff":  "font/woff",
  ".woff2": "font/woff2",
  ".ttf":   "font/ttf",
  ".otf":   "font/otf",
};

function getMime(filepath: string): string {
  return MIME[extname(filepath).toLowerCase()] ?? "application/octet-stream";
}

async function findFreePort(preferred: number): Promise<number> {
  return new Promise((resolvePort) => {
    const server = createServer();
    server.listen(preferred, () => {
      const addr = server.address() as { port: number };
      server.close(() => resolvePort(addr.port));
    });
    server.on("error", () => {
      // Preferred port is taken, take whatever the OS offers.
      const fallback = createServer();
      fallback.listen(0, () => {
        const addr = fallback.address() as { port: number };
        fallback.close(() => resolvePort(addr.port));
      });
    });
  });
}

/** First heading of the deck, with inline markup stripped. */
function deckTitle(slides: Slide[], fallback: string): string {
  const heading = slides[0]?.html.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
  const text = heading ? heading[1].replace(/<[^>]+>/g, "").trim() : "";
  return text || fallback;
}

/** An HTML doc's own `<title>`, with inline markup stripped. */
function docTitle(html: string, fallback: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const text = match ? match[1].replace(/<[^>]+>/g, "").trim() : "";
  return text || fallback;
}

/** A deck name reduced to something safe for a Content-Disposition header. */
function safeFilename(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/\.(md|markdown)$/, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "deck";
}

const MAX_BODY = 32 * 1024 * 1024;

async function readBody(req: IncomingMessage): Promise<string> {
  return (await readBodyBytes(req)).toString("utf-8");
}

function readBodyBytes(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let overflowed = false;
    req.on("data", (chunk: Buffer) => {
      if (overflowed) return;
      size += chunk.length;
      if (size > MAX_BODY) {
        // Reject now but keep the socket open long enough to answer with 413.
        overflowed = true;
        chunks.length = 0;
        rejectBody(new Error("request body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!overflowed) resolveBody(Buffer.concat(chunks));
    });
    req.on("error", rejectBody);
  });
}

function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(html);
}

function sendJson(res: ServerResponse, payload: unknown): void {
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

/** The document the editor session is backed by, when one was passed. */
interface EditorFile {
  name: string;
  kind: "markdown" | "html";
  /** On disk: read fresh per request, written back by the editor. */
  path?: string;
  /** Fetched from a URL once at startup: held in memory, read-only. */
  content?: string;
  /** The file is watched; disk changes ping /__events. */
  watched: boolean;
}

interface EditorMode {
  kind: "editor";
  theme: ThemeName;
  fonts: { head: string | null; body: string | null };
  template: TemplateName;
  transition: TransitionName;
  fullscreen: boolean;
  file?: EditorFile;
  /** The opened file's folder: its other decks can be opened, and uploads land in it. */
  dir?: string;
  /** Claude Code was found and --no-chat was not given; each file still has to pass chatFor. */
  chat?: boolean;
  /** Filled in once the port is known, so PDF rendering can reach the deck. */
  origin?: string;
}

type Mode = EditorMode;

/** Resolve bundled math/diagram assets installed with the npm package. */
function vendorAsset(pathname: string): string | null {
  const name = pathname.replace(/^\/__vendor\/?/, "");

  if (name === "katex.min.css" || name === "katex.min.js" || name.startsWith("fonts/")) {
    const katexDist = dirname(moduleRequire.resolve("katex"));
    const target = resolve(katexDist, name);
    const fromRoot = relative(katexDist, target);
    return !isAbsolute(fromRoot) && !fromRoot.startsWith("..") ? target : null;
  }

  if (name === "mermaid.min.js") {
    const mermaidDist = dirname(moduleRequire.resolve("mermaid"));
    return join(mermaidDist, "mermaid.min.js");
  }

  return null;
}

/** Editor tabs holding an open /__events stream, waiting on a reload ping. */
const liveClients = new Set<ServerResponse>();

/** Each tab reloads only when the change is to the file it has open. */
function notifyLiveClients(name: string): void {
  for (const client of liveClients) {
    try {
      client.write(`data: ${JSON.stringify({ reload: name })}\n\n`);
    } catch {
      liveClients.delete(client);
    }
  }
}

/**
 * The content most recently written to each file by the editor itself, so
 * the watcher can tell the editor's own save landing on disk apart from an
 * external edit and not bounce it back as a reload.
 */
const lastEditorWrite = new Map<string, string>();

/**
 * Watches the decks in the opened file's folder and pings the editor when
 * one changes on disk.
 *
 * The directory is watched rather than each file so editors that save by
 * atomic rename (vim, VS Code, …) do not silently detach the watcher, and so
 * a deck opened later from the files menu is covered too. Events are
 * debounced per file because a single save fires several.
 */
function watchFolder(dir: string): void {
  const timers = new Map<string, NodeJS.Timeout>();
  try {
    watch(dir, (_event, filename) => {
      if (!filename || !isDeckName(filename)) return;
      clearTimeout(timers.get(filename));
      timers.set(filename, setTimeout(() => {
        timers.delete(filename);
        let content: string;
        try {
          content = readFileSync(join(dir, filename), "utf-8");
        } catch {
          return; // mid-save window of an atomic rename; the next event retries
        }
        if (content === lastEditorWrite.get(filename)) return; // our own save landing
        notifyLiveClients(filename);
      }, 150));
    });
  } catch {
    console.error(`${c.dim}deckrun: cannot watch '${basename(dir)}' for changes; live reload is off.${c.reset}`);
  }
}

/**
 * The document a request is about. `?file=` names a deck in the opened
 * file's folder, so each editor tab works on its own file; without it, it is
 * the file deckrun was launched with. Undefined when the named deck is not
 * in the folder.
 */
function docFor(mode: EditorMode, query: URLSearchParams): EditorFile | null | undefined {
  const wanted = query.get("file");
  if (wanted === null || !mode.dir || !mode.file?.path) return mode.file ?? null;
  if (wanted === mode.file.name) return mode.file;
  let listed = false;
  try {
    listed = listDecks(mode.dir).some((entry) => entry.name === wanted);
  } catch {}
  if (!listed) return undefined;
  return { name: wanted, kind: deckKind(wanted), path: join(mode.dir, wanted), watched: mode.file.watched };
}

/** The chat panel can edit this document. */
function chatFor(mode: EditorMode, doc: EditorFile): boolean {
  return !!mode.chat && !!doc.path && !chatBlockedReason(doc.name);
}

/**
 * Same origin only, for routes that write to disk or spend the person's
 * Claude usage: another site's page must not be able to drive them.
 */
function sameOrigin(mode: EditorMode, req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  const allowed = mode.origin ? [mode.origin, mode.origin.replace("127.0.0.1", "localhost")] : [];
  return !!origin && allowed.includes(origin);
}

function forbidden(res: ServerResponse): true {
  res.writeHead(403, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "forbidden" }));
  return true;
}

function notInFolder(res: ServerResponse): true {
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "missing", detail: "That file is no longer in the folder." }));
  return true;
}

/** Decks built from editor content, addressable so a new tab can load them. */
const decks = new Map<number, string>();
let deckSeq = 0;

/**
 * Stores a built deck and returns the path that serves it.
 *
 * The path stays at the root on purpose: a deck served from a subpath would
 * resolve `![](diagram.png)` against that subpath instead of the directory
 * being served, and every local image would 404.
 */
function stashDeck(html: string): string {
  const id = ++deckSeq;
  decks.set(id, html);
  // Keep only the handful of most recent builds.
  for (const key of decks.keys()) {
    if (decks.size <= 8) break;
    decks.delete(key);
  }
  return `/?deck=${id}`;
}

/** A built deck, addressed by `?deck=<id>` so its base URL stays the root. */
function serveStashedDeck(id: string, res: ServerResponse): void {
  const html = decks.get(parseInt(id, 10));
  if (!html) {
    res.writeHead(410, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("This build has expired. Press present again in the editor.");
    return;
  }
  sendHtml(res, html);
}

/** Pictures of slides rendered for the chat's /look, kept until a few newer ones replace them. */
const looks = new Map<number, Buffer>();
let lookSeq = 0;

function keepLook(png: Buffer): number {
  const id = ++lookSeq;
  looks.set(id, png);
  for (const key of looks.keys()) {
    if (looks.size <= 6) break;
    looks.delete(key);
  }
  return id;
}

async function handleEditorRoute(
  mode: EditorMode,
  pathname: string,
  query: URLSearchParams,
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  if (pathname === "/__preview" && req.method === "GET") {
    sendHtml(
      res,
      generatePreviewHtml(mode.theme, mode.fonts, mode.template, mode.transition)
    );
    return true;
  }

  if (pathname === "/__file" && req.method === "GET" && mode.file) {
    const doc = docFor(mode, query);
    if (!doc) return notInFolder(res);
    let content: string;
    if (doc.path) {
      try {
        content = readFileSync(doc.path, "utf-8");
      } catch {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Cannot read the file.");
        return true;
      }
    } else {
      content = doc.content ?? "";
    }
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(content);
    return true;
  }

  if (pathname === "/__file" && req.method === "POST" && mode.file) {
    const doc = docFor(mode, query);
    if (!doc) return notInFolder(res);
    if (!doc.path) {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "read-only", detail: "This document came from a URL; download it to keep changes." }));
      return true;
    }
    if (!sameOrigin(mode, req)) return forbidden(res);
    const content = await readBody(req);
    // Remember the write before it lands so the watcher can ignore its echo.
    lastEditorWrite.set(doc.name, content);
    try {
      writeFileSync(doc.path, content, "utf-8");
    } catch {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "write failed" }));
      return true;
    }
    sendJson(res, { ok: true });
    return true;
  }

  if (pathname === "/__events" && req.method === "GET" && mode.file?.watched) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    });
    res.write(": connected\n\n");
    liveClients.add(res);
    req.on("close", () => liveClients.delete(res));
    return true;
  }

  if (pathname === "/__files" && req.method === "GET" && mode.dir) {
    try {
      sendJson(res, { folder: basename(mode.dir), path: mode.dir, files: listDecks(mode.dir) });
    } catch {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "cannot list the folder" }));
    }
    return true;
  }

  if (pathname === "/__upload" && req.method === "POST" && mode.dir) {
    if (!sameOrigin(mode, req)) return forbidden(res);
    const data = await readBodyBytes(req);
    let result: UploadResult;
    try {
      result = saveUpload(mode.dir, query.get("name") ?? "", data, query.get("replace") === "1");
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "write failed", detail: err instanceof Error ? err.message : "" }));
      return true;
    }
    if (result.status === "refused") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "refused", detail: result.reason }));
      return true;
    }
    sendJson(res, result);
    return true;
  }

  // /look: one slide, rendered by the same headless browser as the PDF
  // export, for Claude to see. The page sends the slide on its own (the deck
  // reduced to it, as for a thumbnail); the picture stays here, and the chat
  // message names it by id.
  if (pathname === "/__look" && mode.chat && mode.file?.path) {
    if (req.method === "GET") {
      const png = looks.get(parseInt(query.get("id") ?? "", 10));
      if (!png) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("This picture has expired.");
        return true;
      }
      res.writeHead(200, { "Content-Type": "image/png", "Content-Length": png.length, "Cache-Control": "no-store" });
      res.end(png);
      return true;
    }
    if (req.method !== "POST") return false;
    if (!sameOrigin(mode, req)) return forbidden(res);
    let body: { html?: string };
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "bad request" }));
      return true;
    }
    const html = typeof body.html === "string" ? body.html : "";
    if (!html.trim()) {
      res.writeHead(422, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "empty document" }));
      return true;
    }
    const browser = await findBrowser();
    if (!browser) {
      res.writeHead(501, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: "no browser",
        detail: "/look needs Chrome, Chromium, Edge, or Brave. Set DECKRUN_BROWSER to one.",
      }));
      return true;
    }
    try {
      const png = await renderPngSerial(`${mode.origin}${stashDeck(html)}`, browser, 1280, 720);
      sendJson(res, { id: keepLook(png), width: 1280, height: 720 });
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "render failed", detail: (err as Error).message }));
    }
    return true;
  }

  // Download → "this slide as an image": one slide (the deck reduced to it,
  // as for a thumbnail) drawn by the headless browser at twice its size.
  if (pathname === "/__png" && req.method === "POST") {
    if (!sameOrigin(mode, req)) return forbidden(res);
    let body: { html?: string; width?: number; height?: number; scale?: number };
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "bad request" }));
      return true;
    }
    const html = typeof body.html === "string" ? body.html : "";
    if (!html.trim()) {
      res.writeHead(422, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "empty document" }));
      return true;
    }
    const size = (v: unknown, dflt: number, max: number): number =>
      typeof v === "number" && isFinite(v) ? Math.max(100, Math.min(max, Math.round(v))) : dflt;
    const width = size(body.width, 1280, 3840);
    const height = size(body.height, 720, 2400);
    const scale = typeof body.scale === "number" && body.scale >= 1 && body.scale <= 3 ? body.scale : 2;
    const browser = await findBrowser();
    if (!browser) {
      res.writeHead(501, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: "no browser",
        detail: "Drawing a slide needs Chrome, Chromium, Edge, or Brave. Set DECKRUN_BROWSER to one.",
      }));
      return true;
    }
    try {
      const png = await renderPngSerial(`${mode.origin}${stashDeck(html)}`, browser, width, height, scale);
      res.writeHead(200, { "Content-Type": "image/png", "Content-Length": png.length, "Cache-Control": "no-store" });
      res.end(png);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "render failed", detail: (err as Error).message }));
    }
    return true;
  }

  if (pathname.startsWith("/__chat") && req.method === "POST" && mode.chat && mode.file?.path) {
    // Same origin only: this route spends the person's Claude usage and
    // edits a file.
    if (!sameOrigin(mode, req)) return forbidden(res);
    if (pathname === "/__chat/stop") {
      sendJson(res, { stopped: stopChat() });
      return true;
    }
    const doc = docFor(mode, query);
    if (!doc) return notInFolder(res);
    if (!chatFor(mode, doc)) return forbidden(res);
    if (pathname === "/__chat/reset") {
      if (!chatBusy()) resetChat(doc.path!);
      sendJson(res, { ok: !chatBusy() });
      return true;
    }
    if (pathname !== "/__chat") return false;
    if (chatBusy()) {
      res.writeHead(409, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "busy", detail: "Claude is still working on the last message." }));
      return true;
    }
    let body: { message?: string; context?: string; model?: string; look?: number };
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "bad request" }));
      return true;
    }
    const message = (body.message ?? "").trim();
    if (!message) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "empty message" }));
      return true;
    }
    // "default" is Claude Code's own choice, the same as naming none.
    const model = typeof body.model === "string" && body.model !== "default" ? body.model : "";
    if (model && !chatModelOk(model)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "bad model", detail: `'${model.slice(0, 40)}' is not a model name.` }));
      return true;
    }
    const image = typeof body.look === "number" ? looks.get(body.look) : undefined;
    if (body.look !== undefined && !image) {
      res.writeHead(410, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "expired", detail: "That picture of the slide has expired. Type /look again." }));
      return true;
    }
    res.writeHead(200, {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    });
    await runChatTurn({
      filePath: doc.path!,
      kind: doc.kind,
      message,
      // Room for a slide's source, which the page already trims to a few kilobytes.
      context: typeof body.context === "string" ? body.context.slice(0, 16000) : undefined,
      model: model || undefined,
      image,
      send: (event) => {
        if (!res.writableEnded) res.write(JSON.stringify(event) + "\n");
      },
    });
    res.end();
    return true;
  }

  if (pathname === "/__parse" && req.method === "POST") {
    const markdown = await readBody(req);
    // Mapped: the preview's elements carry source tags for the inspector.
    const slides = parseSlides(markdown, { map: true });
    sendJson(res, {
      slides: slides.map((slide, i) => renderSlide(slide, i)),
      notes: slides.map((slide) => slide.notes ?? ""),
      title: deckTitle(slides, ""),
      map: slides.map((slide) => slide.map ?? []),
    });
    return true;
  }

  if (pathname === "/__present" && req.method === "POST") {
    const body = JSON.parse(await readBody(req)) as {
      markdown?: string;
      theme?: string;
      head?: string | null;
      body?: string | null;
      title?: string;
      print?: boolean;
      template?: string;
      transition?: string;
      standalone?: boolean;
    };
    const slides = parseSlides(body.markdown ?? "");
    if (slides.length === 0) {
      res.writeHead(422, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "no slides" }));
      return true;
    }
    const theme = resolveThemeName(body.theme);
    const template = resolveTemplateName(body.template);
    const transition = resolveTransitionName(body.transition);
    const title = deckTitle(slides, body.title?.trim() || "deckrun");
    // A deck built for printing must not open behind a fullscreen prompt.
    const forPrint = body.print === true;
    const path = stashDeck(
      generateHtml(slides, title, forPrint ? false : mode.fullscreen, theme, {
        head: body.head,
        body: body.body,
      }, { template, transition, standalone: body.standalone === true })
    );
    sendJson(res, { path: forPrint ? `${path}&print=1` : path });
    return true;
  }

  if (pathname === "/__pdf" && req.method === "POST") {
    const body = JSON.parse(await readBody(req)) as {
      markdown?: string;
      theme?: string;
      head?: string | null;
      body?: string | null;
      title?: string;
      template?: string;
      transition?: string;
    };
    const slides = parseSlides(body.markdown ?? "");
    if (slides.length === 0) {
      res.writeHead(422, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "no slides" }));
      return true;
    }

    const browser = await findBrowser();
    if (!browser) {
      // The caller falls back to the print dialog, which prints correctly too.
      res.writeHead(501, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "no browser",
          detail:
            "No Chrome, Chromium, Edge, or Brave found. Set DECKRUN_BROWSER to one to export PDFs directly.",
        })
      );
      return true;
    }

    const theme = resolveThemeName(body.theme);
    const template = resolveTemplateName(body.template);
    const transition = resolveTransitionName(body.transition);
    const title = deckTitle(slides, body.title?.trim() || "deckrun");
    const path = stashDeck(
      generateHtml(
        slides,
        title,
        false,
        theme,
        { head: body.head, body: body.body },
        { template, transition }
      )
    );

    try {
      const pdf = await renderPdfSerial(`${mode.origin}${path}`, browser);
      const filename = safeFilename(body.title?.trim() || title) + ".pdf";
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Length": pdf.length,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      });
      res.end(pdf);
    } catch (err) {
      const detail = err instanceof PdfError ? err.message : "rendering failed";
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "render failed", detail }));
    }
    return true;
  }

  if (pathname === "/__fetch-doc" && req.method === "POST") {
    const body = JSON.parse(await readBody(req)) as { url?: string };
    const raw = (body.url ?? "").trim();

    let target: URL;
    try {
      target = new URL(raw);
    } catch {
      res.writeHead(422, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "invalid url" }));
      return true;
    }
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      res.writeHead(422, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "url must be http or https" }));
      return true;
    }

    let upstream: Response;
    try {
      // Fetched server-side, not from the browser, so a page with no
      // Access-Control-Allow-Origin still loads fine.
      upstream = await fetch(target, {
        redirect: "follow",
        signal: AbortSignal.timeout(15_000),
        headers: { "User-Agent": "deckrun" },
      });
    } catch (err) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "fetch failed",
          detail: err instanceof Error ? err.message : "network error",
        })
      );
      return true;
    }

    if (!upstream.ok) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ error: "fetch failed", detail: `upstream responded ${upstream.status}` })
      );
      return true;
    }

    const rawContent = await upstream.text();
    if (rawContent.length > MAX_BODY) {
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "too large",
          detail: `page is larger than ${Math.round(MAX_BODY / 1024 / 1024)} MB`,
        })
      );
      return true;
    }
    if (!rawContent.trim()) {
      res.writeHead(422, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "empty document" }));
      return true;
    }

    const contentType = (upstream.headers.get("content-type") ?? "").toLowerCase();
    const pathname = target.pathname.toLowerCase();

    let isHtml = false;
    if (pathname.endsWith(".html") || pathname.endsWith(".htm")) {
      isHtml = true;
    } else if (pathname.endsWith(".md") || pathname.endsWith(".markdown")) {
      isHtml = false;
    } else if (
      contentType.includes("text/html") ||
      contentType.includes("application/xhtml+xml")
    ) {
      isHtml = true;
    } else if (
      contentType.includes("text/markdown") ||
      contentType.includes("text/x-markdown") ||
      contentType.includes("text/plain")
    ) {
      isHtml = false;
    } else if (/<!doctype\s+html/i.test(rawContent) || /<html[\s>]/i.test(rawContent)) {
      isHtml = true;
    }

    const defaultName = target.pathname.split("/").filter(Boolean).pop() || target.hostname;
    let title: string;
    if (isHtml) {
      title = docTitle(rawContent, defaultName);
    } else {
      const slides = parseSlides(rawContent);
      title = deckTitle(slides, defaultName);
    }

    sendJson(res, {
      kind: isHtml ? "html" : "markdown",
      content: rawContent,
      html: isHtml ? rawContent : undefined,
      markdown: !isHtml ? rawContent : undefined,
      title,
    });
    return true;
  }

  if (pathname === "/__present-doc" && req.method === "POST") {
    const body = JSON.parse(await readBody(req)) as {
      html?: string;
      theme?: string;
      title?: string;
      print?: boolean;
      /** Open a slide deck at this slide (its position among the slides shown). */
      start?: number;
    };
    const raw = body.html ?? "";
    if (!raw.trim()) {
      res.writeHead(422, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "empty document" }));
      return true;
    }
    const theme = resolveThemeName(body.theme);
    const title = docTitle(raw, body.title?.trim() || "deckrun");
    const forPrint = body.print === true;
    const start = !forPrint && typeof body.start === "number" && body.start >= 0 ? Math.floor(body.start) : null;
    const docPath = stashDeck(raw);
    const wrapperPath = stashDeck(
      generateDocHtml(docPath, title, forPrint ? false : mode.fullscreen, theme, start)
    );
    sendJson(res, { path: forPrint ? `${wrapperPath}&print=1` : wrapperPath, docPath });
    return true;
  }

  if (pathname === "/__pdf-doc" && req.method === "POST") {
    const body = JSON.parse(await readBody(req)) as {
      html?: string;
      title?: string;
    };
    const raw = body.html ?? "";
    if (!raw.trim()) {
      res.writeHead(422, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "empty document" }));
      return true;
    }

    const browser = await findBrowser();
    if (!browser) {
      res.writeHead(501, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "no browser",
          detail:
            "No Chrome, Chromium, Edge, or Brave found. Set DECKRUN_BROWSER to one to export PDFs directly.",
        })
      );
      return true;
    }

    const title = docTitle(raw, body.title?.trim() || "deckrun");
    // Print the raw doc directly, with no chrome wrapper: its own @page /
    // print CSS (or Chrome's defaults) governs pagination, and there is no
    // presenter chrome to strip since there is none in the printed page.
    const docPath = stashDeck(raw);

    try {
      const pdf = await renderPdfSerial(`${mode.origin}${docPath}`, browser);
      const filename = safeFilename(body.title?.trim() || title) + ".pdf";
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Length": pdf.length,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      });
      res.end(pdf);
    } catch (err) {
      const detail = err instanceof PdfError ? err.message : "rendering failed";
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "render failed", detail }));
    }
    return true;
  }

  return false;
}

async function serve(mode: Mode, baseDir: string, port: number): Promise<string> {
  const server = createServer(async (req, res) => {
    try {
      const rawUrl = req.url ?? "/";
      const [rawPath, rawQuery = ""] = rawUrl.split("?");
      const pathname = decodeURIComponent(rawPath);
      const query = new URLSearchParams(rawQuery);

      if (pathname === "/" || pathname === "/index.html") {
        const wantsDeck = query.get("deck");
        if (wantsDeck) {
          serveStashedDeck(wantsDeck, res);
          return;
        }
        const doc = docFor(mode, query);
        if (doc === undefined) {
          // Renamed or deleted since the link was made: open the launch file and say why.
          res.writeHead(302, { Location: `/?missing=${encodeURIComponent(query.get("file") ?? "")}` });
          res.end();
          return;
        }
        sendHtml(
          res,
          generateEditorHtml(
            mode.theme,
            mode.fonts,
            mode.template,
            mode.transition,
            doc
              ? {
                  name: doc.name,
                  kind: doc.kind,
                  writable: !!doc.path,
                  watched: doc.watched,
                  chat: chatFor(mode, doc),
                  folder: mode.dir ? basename(mode.dir) : undefined,
                }
              : null
          )
        );
        return;
      }

      if (pathname.startsWith("/__vendor/")) {
        const asset = vendorAsset(pathname);
        if (!asset) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not found");
          return;
        }
        const data = await readFile(asset);
        res.writeHead(200, {
          "Content-Type": getMime(asset),
          "Cache-Control": "public, max-age=31536000, immutable",
        });
        res.end(data);
        return;
      }

      if (await handleEditorRoute(mode, pathname, query, req, res)) {
        return;
      }

      // Everything else comes off disk, relative to the working directory.
      const filePath = resolve(baseDir, pathname.replace(/^\/+/, ""));
      const fromBase = relative(baseDir, filePath);
      if (isAbsolute(fromBase) || fromBase.startsWith("..")) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      const data = await readFile(filePath);
      res.writeHead(200, { "Content-Type": getMime(filePath) });
      res.end(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "error";
      if (message === "request body too large") {
        res.writeHead(413, { "Content-Type": "text/plain", Connection: "close" });
        res.end(`Deck is larger than ${Math.round(MAX_BODY / 1024 / 1024)} MB.`);
        req.destroy();
        return;
      }
      if (!res.headersSent) res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
    }
  });

  await new Promise<void>((ready) => server.listen(port, "127.0.0.1", ready));
  return `http://127.0.0.1:${port}`;
}

// ── CLI ───────────────────────────────────────────────────────────────────
const program = new Command();

program
  .name("deckrun")
  .description(
    "Open a Markdown file, HTML file, or public URL in the built-in editor, and present from there. Run without an argument for a blank editor."
  )
  .version(packageVersion(), "-v, --version", "Print the version number")
  .argument("[file]", "Markdown file, HTML file, or public URL to open in the editor. Omit it for a blank editor.")
  .option("-p, --port <number>", "Port to serve on", "7890")
  .option("--no-open", "Do not automatically open the browser")
  .option("--no-watch", "Do not watch the opened file for changes on disk")
  .option("--no-chat", "Hide the Claude chat panel that edits the opened file")
  .option("--chat-check", "Run one test chat turn with Claude Code, print what happens, and exit")
  .option("--fullscreen", "Auto-enter fullscreen on first interaction")
  .option("--theme <name>", "Color theme, by id (see --list-themes)", DEFAULT_THEME)
  .option("--head-font <name>", "Override the theme's heading face (see --list-fonts)")
  .option("--body-font <name>", "Override the theme's body face (see --list-fonts)")
  .option("--template <name>", "Composition template (see --list-templates)", DEFAULT_TEMPLATE)
  .option("--transition <name>", "Slide transition (see --list-transitions)", DEFAULT_TRANSITION)
  .option("--list-themes", "Print every theme and exit")
  .option("--list-fonts", "Print every font face and exit")
  .option("--list-templates", "Print every composition template and exit")
  .option("--list-transitions", "Print every slide transition and exit")
  .action(
    async (
      file: string | undefined,
      opts: {
        port: string;
        open: boolean;
        watch: boolean;
        chat: boolean;
        chatCheck?: boolean;
        fullscreen?: boolean;
        theme: string;
        headFont?: string;
        bodyFont?: string;
        template: string;
        transition: string;
        listThemes?: boolean;
        listFonts?: boolean;
        listTemplates?: boolean;
        listTransitions?: boolean;
      }
    ) => {
      if (opts.listThemes) {
        for (const line of themeListing()) console.log(line);
        process.exit(0);
      }
      if (opts.listFonts) {
        for (const line of fontListing()) console.log(line);
        process.exit(0);
      }
      if (opts.listTemplates) {
        for (const line of templateListing()) console.log(line);
        process.exit(0);
      }
      if (opts.listTransitions) {
        for (const line of transitionListing()) console.log(line);
        process.exit(0);
      }
      if (opts.chatCheck) {
        process.exit(await chatCheck());
      }

      const named = findTheme(opts.theme);
      if (!named) {
        console.error(
          `deckrun: unknown theme '${opts.theme}'. Run --list-themes to see them all.`
        );
        process.exit(1);
      }
      const templated = findTemplate(opts.template);
      if (!templated) {
        console.error(
          `deckrun: unknown template '${opts.template}'. Run --list-templates to see them all.`
        );
        process.exit(1);
      }
      const transitioned = findTransition(opts.transition);
      if (!transitioned) {
        console.error(
          `deckrun: unknown transition '${opts.transition}'. Run --list-transitions to see them all.`
        );
        process.exit(1);
      }
      // Both face flags are optional; unset means the theme keeps its own.
      const fonts: { head: string | null; body: string | null } = { head: null, body: null };
      for (const [flag, slot] of [
        ["--head-font", "head"],
        ["--body-font", "body"],
      ] as const) {
        const raw = slot === "head" ? opts.headFont : opts.bodyFont;
        if (raw === undefined) continue;
        const face = findFont(raw);
        if (!face) {
          console.error(
            `deckrun: unknown font '${raw}' for ${flag}. Run --list-fonts to see them all.`
          );
          process.exit(1);
        }
        fonts[slot] = face;
      }

      const theme: ThemeName = named;
      const template: TemplateName = templated;
      const transition: TransitionName = transitioned;
      const fullscreen = !!opts.fullscreen;

      let mode: Mode;
      let baseDir: string;

      if (file) {
        if (/^https?:\/\//i.test(file)) {
          let target: URL;
          try {
            target = new URL(file);
          } catch {
            console.error(`deckrun: invalid URL '${file}'`);
            process.exit(1);
          }

          let upstream: Response;
          try {
            upstream = await fetch(target, {
              redirect: "follow",
              signal: AbortSignal.timeout(15_000),
              headers: { "User-Agent": "deckrun" },
            });
          } catch (err) {
            console.error(
              `deckrun: cannot fetch '${file}': ${err instanceof Error ? err.message : "network error"}`
            );
            process.exit(1);
          }

          if (!upstream.ok) {
            console.error(`deckrun: fetch failed for '${file}' (HTTP ${upstream.status})`);
            process.exit(1);
          }

          const rawContent = await upstream.text();
          if (!rawContent.trim()) {
            console.error(`deckrun: empty document fetched from '${file}'`);
            process.exit(1);
          }

          const contentType = (upstream.headers.get("content-type") ?? "").toLowerCase();
          const pathname = target.pathname.toLowerCase();

          let isHtml = false;
          if (pathname.endsWith(".html") || pathname.endsWith(".htm")) {
            isHtml = true;
          } else if (pathname.endsWith(".md") || pathname.endsWith(".markdown")) {
            isHtml = false;
          } else if (
            contentType.includes("text/html") ||
            contentType.includes("application/xhtml+xml")
          ) {
            isHtml = true;
          } else if (
            contentType.includes("text/markdown") ||
            contentType.includes("text/x-markdown") ||
            contentType.includes("text/plain")
          ) {
            isHtml = false;
          } else if (/<!doctype\s+html/i.test(rawContent) || /<html[\s>]/i.test(rawContent)) {
            isHtml = true;
          }

          baseDir = process.cwd();
          const defaultName = target.pathname.split("/").filter(Boolean).pop() || target.hostname;

          // A fetched page is a one-shot import: it opens in the editor,
          // held in memory, read-only toward its origin.
          let editorFile: EditorFile;
          if (isHtml) {
            let docHtml = rawContent;
            if (!/<base\s/i.test(docHtml)) {
              if (/<head[^>]*>/i.test(docHtml)) {
                docHtml = docHtml.replace(/<head[^>]*>/i, (m) => `${m}\n  <base href="${target.href}">`);
              } else {
                docHtml = `<base href="${target.href}">\n` + docHtml;
              }
            }
            editorFile = {
              name: docTitle(rawContent, defaultName),
              kind: "html",
              content: docHtml,
              watched: false,
            };
            console.log(`${c.dim}opening ${file} in the editor as an HTML doc${c.reset}`);
          } else {
            const slides = parseSlides(rawContent);
            editorFile = {
              name: defaultName,
              kind: "markdown",
              content: rawContent,
              watched: false,
            };
            console.log(
              `${c.dim}${slides.length} slide${slides.length !== 1 ? "s" : ""} from ${file} · opening in the editor${c.reset}`
            );
          }

          mode = { kind: "editor", theme, fonts, template, transition, fullscreen, file: editorFile };
        } else {
          const absPath = resolve(process.cwd(), file);
          baseDir = dirname(absPath);
          const ext = extname(absPath).toLowerCase();
          const kind = ext === ".html" || ext === ".htm" ? "html" : "markdown";

          let raw: string;
          try {
            raw = readFileSync(absPath, "utf-8");
          } catch {
            console.error(`deckrun: cannot read file '${file}'`);
            process.exit(1);
          }

          mode = {
            kind: "editor",
            theme,
            fonts,
            template,
            transition,
            fullscreen,
            file: { name: basename(absPath), kind, path: absPath, watched: opts.watch },
            dir: baseDir,
          };

          if (opts.chat && findClaude()) {
            mode.chat = true;
            const blocked = chatBlockedReason(basename(absPath));
            if (blocked) console.log(`${c.dim}chat is off for this file: ${blocked}.${c.reset}`);
          } else if (opts.chat) {
            console.log(
              `${c.yellow}chat is off: Claude Code was not found. Set DECKRUN_CLAUDE to the path 'where.exe claude' prints, or run deckrun --chat-check.${c.reset}`
            );
          }

          if (opts.watch) watchFolder(baseDir);

          if (kind === "markdown") {
            const slides = parseSlides(raw);
            console.log(
              `${c.dim}${slides.length} slide${slides.length !== 1 ? "s" : ""} from ${basename(absPath)} · opening in the editor${c.reset}`
            );
          } else {
            console.log(`${c.dim}opening ${basename(absPath)} in the editor as an HTML doc${c.reset}`);
          }
        }
      } else {
        baseDir = process.cwd();
        mode = { kind: "editor", theme, fonts, template, transition, fullscreen };
      }

      const port = await findFreePort(parseInt(opts.port, 10));
      mode.origin = `http://127.0.0.1:${port}`;
      const url = await serve(mode, baseDir, port);

      console.log(
        `${c.bold}${c.magenta}editor${c.reset} ${c.dim}→${c.reset} ${c.cyan}${c.bold}${url}${c.reset}  ${c.dim}(Ctrl+C to stop)${c.reset}`
      );

      if (mode.file?.path) {
        console.log(
          `${c.dim}write on the left, live deck on the right. saves back to ${mode.file.name}.${c.reset}`
        );
        if (mode.file.watched) {
          console.log(
            `${c.dim}edits to ${mode.file.name} on disk reload the editor as well.${c.reset}`
          );
        }
        if (chatFor(mode, mode.file)) {
          console.log(
            `${c.dim}Cmd/Ctrl+J opens a Claude chat that edits ${mode.file.name}, using your Claude Code login.${c.reset}`
          );
        }
        console.log(
          `${c.dim}Cmd/Ctrl+O opens another deck from ${basename(baseDir)}; drop files on the editor to copy them in.${c.reset}`
        );
      } else {
        console.log(
          `${c.dim}write on the left, live deck on the right. autosaves to your browser.${c.reset}`
        );
      }
      console.log(
        `${c.dim}Cmd/Ctrl+K inserts anything · template/theme controls recompose live · Cmd/Ctrl+Enter presents${c.reset}`
      );

      if (opts.open !== false) await open(url);

      // Keep the process alive until interrupted.
      await new Promise<void>(() => {});
    }
  );

program
  .command("lint")
  .description("Check Markdown decks for common authoring and rendering problems")
  .argument("<files...>", "Markdown files to check; use - to read standard input")
  .option("--format <format>", "Output format: stylish or json", "stylish")
  .option("--max-warnings <number>", "Warnings allowed before the command fails", "0")
  .action(
    (files: string[], opts: { format: string; maxWarnings: string }) => {
      if (opts.format !== "stylish" && opts.format !== "json") {
        console.error("deckrun lint: --format must be 'stylish' or 'json'.");
        process.exitCode = 2;
        return;
      }

      const maxWarnings = Number.parseInt(opts.maxWarnings, 10);
      if (!Number.isInteger(maxWarnings) || maxWarnings < -1) {
        console.error("deckrun lint: --max-warnings must be -1 or a non-negative integer.");
        process.exitCode = 2;
        return;
      }

      const reports: Array<{
        file: string;
        issues: LintIssue[];
        slides: number;
        errors: number;
        warnings: number;
      }> = [];

      for (const file of files) {
        let markdown: string;
        try {
          markdown = file === "-" ? readFileSync(0, "utf-8") : readFileSync(resolve(process.cwd(), file), "utf-8");
        } catch {
          reports.push({
            file,
            slides: 0,
            errors: 1,
            warnings: 0,
            issues: [{
              rule: "file-read",
              severity: "error",
              message: "The file could not be read.",
              line: 1,
              column: 1,
            }],
          });
          continue;
        }

        const result = lintMarkdown(markdown);
        reports.push({ file, ...result });
      }

      const errors = reports.reduce((sum, report) => sum + report.errors, 0);
      const warnings = reports.reduce((sum, report) => sum + report.warnings, 0);
      const issueCount = errors + warnings;

      if (opts.format === "json") {
        console.log(JSON.stringify({ files: reports, errors, warnings }, null, 2));
      } else {
        for (const report of reports) {
          if (!report.issues.length) continue;
          console.log(`\n${report.file}`);
          for (const item of report.issues) {
            const position = `${item.line}:${item.column}`.padEnd(9);
            const severity = item.severity.padEnd(7);
            const slide = item.slide ? `slide ${item.slide} · ` : "";
            console.log(`  ${position} ${severity} ${slide}${item.message}  ${item.rule}`);
          }
        }

        if (issueCount === 0) {
          const slides = reports.reduce((sum, report) => sum + report.slides, 0);
          console.log(`✓ ${files.length} file${files.length === 1 ? "" : "s"}, ${slides} slide${slides === 1 ? "" : "s"}, no problems`);
        } else {
          console.log(
            `\n✖ ${issueCount} problem${issueCount === 1 ? "" : "s"} (${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"})`
          );
        }
      }

      if (errors > 0 || (maxWarnings !== -1 && warnings > maxWarnings)) {
        process.exitCode = 1;
      }
    }
  );

program.parse(process.argv);
