import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { basename, extname, join } from "path";

/**
 * The folder behind a file-mode session: the decks the editor's files menu
 * switches between, and the uploads copied in beside them.
 *
 * Everything stays directly inside that one folder. A deck that arrives
 * under a name already taken is kept next to the old one, never over it. An
 * image or other asset may replace its namesake, but only when the person
 * says so, and the old copy goes to the backup folder first.
 */

export const BACKUP_DIR = ".deckrun-backup";

const DECK_EXT = /\.(html?|md|markdown)$/i;

/** What a deck may lean on: images, media, fonts, styles, scripts. */
const ASSET_EXTS = [
  "png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "bmp", "ico",
  "mp4", "webm", "mov", "mp3", "wav", "ogg", "m4a",
  "woff", "woff2", "ttf", "otf",
  "css", "js", "json", "pdf", "txt",
];
const ASSET_EXT = new RegExp(`\\.(${ASSET_EXTS.join("|")})$`, "i");

/** The file picker's accept list, matching what an upload will take. */
export const UPLOAD_ACCEPT = [".html", ".htm", ".md", ".markdown", ...ASSET_EXTS.map((ext) => "." + ext)].join(",");

export function isDeckName(name: string): boolean {
  return DECK_EXT.test(name);
}

export function deckKind(name: string): "html" | "markdown" {
  return /\.html?$/i.test(name) ? "html" : "markdown";
}

/**
 * The name itself when it is a plain file name that can be created in the
 * folder on any platform, otherwise null.
 */
export function cleanName(raw: string): string | null {
  if (!raw || raw.length > 200) return null;
  if (raw !== basename(raw) || /[\\/:*?"<>|\x00-\x1f]/.test(raw)) return null;
  // Dotfiles stay hidden, and Windows drops a trailing dot or space.
  if (raw.startsWith(".") || /[. ]$/.test(raw)) return null;
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(raw)) return null;
  return raw;
}

export interface FolderEntry {
  name: string;
  kind: "html" | "markdown";
  size: number;
  modified: number;
}

/** The decks directly in `dir`, in the order a person numbering them expects. */
export function listDecks(dir: string): FolderEntry[] {
  const entries: FolderEntry[] = [];
  for (const dirent of readdirSync(dir, { withFileTypes: true })) {
    if (!dirent.isFile() || dirent.name.startsWith(".") || !isDeckName(dirent.name)) continue;
    try {
      const stat = statSync(join(dir, dirent.name));
      entries.push({ name: dirent.name, kind: deckKind(dirent.name), size: stat.size, modified: stat.mtimeMs });
    } catch {
      // Gone between the listing and the stat.
    }
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
}

export type UploadResult =
  | { status: "created" | "same" | "renamed"; name: string }
  | { status: "replaced"; name: string; backup: string }
  | { status: "conflict"; name: string }
  | { status: "refused"; reason: string };

/**
 * Copies one uploaded file into `dir`.
 *
 * - A new name is simply created.
 * - The same bytes already there count as done (`same`).
 * - A deck under a taken name lands as `name (2).html`, and so on.
 * - An asset under a taken name comes back as a `conflict` unless `replace`
 *   is set; then the old one is copied to the backup folder and overwritten.
 */
export function saveUpload(
  dir: string,
  rawName: string,
  data: Buffer,
  replace: boolean,
  now: Date = new Date()
): UploadResult {
  const name = cleanName(rawName);
  if (!name) return { status: "refused", reason: "not a plain file name" };
  const deck = isDeckName(name);
  if (!deck && !ASSET_EXT.test(name)) {
    return { status: "refused", reason: "not a deck (.html, .md) or a file a deck uses (images, media, fonts, styles)" };
  }

  const target = join(dir, name);
  if (!existsSync(target)) {
    writeFileSync(target, data, { flag: "wx" });
    return { status: "created", name };
  }
  if (!statSync(target).isFile()) return { status: "refused", reason: "a folder already has that name" };
  if (readFileSync(target).equals(data)) return { status: "same", name };

  if (deck) {
    const ext = extname(name);
    const stem = name.slice(0, name.length - ext.length);
    for (let n = 2; ; n++) {
      const candidate = `${stem} (${n})${ext}`;
      const path = join(dir, candidate);
      if (!existsSync(path)) {
        writeFileSync(path, data, { flag: "wx" });
        return { status: "renamed", name: candidate };
      }
      // An earlier upload of this same version is already beside it.
      if (statSync(path).isFile() && readFileSync(path).equals(data)) return { status: "same", name: candidate };
    }
  }

  if (!replace) return { status: "conflict", name };
  const backup = backupCopy(dir, name, now);
  writeFileSync(target, data);
  return { status: "replaced", name, backup };
}

/** Copies `name` into the backup folder under a timestamped name; returns that path, relative to `dir`. */
function backupCopy(dir: string, name: string, now: Date): string {
  const backups = join(dir, BACKUP_DIR);
  mkdirSync(backups, { recursive: true });
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const ext = extname(name);
  const stem = name.slice(0, name.length - ext.length);
  let copy = `${stem}.${stamp}${ext}`;
  for (let n = 2; existsSync(join(backups, copy)); n++) copy = `${stem}.${stamp}-${n}${ext}`;
  copyFileSync(join(dir, name), join(backups, copy));
  return `${BACKUP_DIR}/${copy}`;
}
