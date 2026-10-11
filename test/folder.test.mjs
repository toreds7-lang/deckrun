import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BACKUP_DIR, cleanName, listDecks, saveUpload, UPLOAD_ACCEPT } from "../dist/folder.js";
import { generateEditorHtml } from "../dist/editor.js";

const temps = [];
after(() => {
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
});

function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deckrun-folder-"));
  temps.push(dir);
  return dir;
}

test("only plain file names can be created in the folder", () => {
  for (const ok of ["1_omakase_coding_eng.html", "1_omakase_coding_kor_망한버젼.html", "talk (v2) final.html", "a.b.png"]) {
    assert.equal(cleanName(ok), ok);
  }
  for (const bad of ["", "../x.html", "..\\x.html", "sub/x.html", "C:x.html", ".env", "x.html.", "x.html ", "con.html", "LPT1", "a?.png", "a\u0001.png"]) {
    assert.equal(cleanName(bad), null, bad);
  }
});

test("the files menu lists decks in the order a person numbers them", () => {
  const dir = tempDir();
  for (const name of ["10_end.html", "2_shadowing.html", "0_motivation.html", "notes.md", "pic.png", ".hidden.html"]) {
    fs.writeFileSync(path.join(dir, name), "x");
  }
  fs.mkdirSync(path.join(dir, "folder.html"));
  assert.deepEqual(
    listDecks(dir).map((entry) => entry.name),
    ["0_motivation.html", "2_shadowing.html", "10_end.html", "notes.md"]
  );
  const md = listDecks(dir).find((entry) => entry.name === "notes.md");
  assert.equal(md.kind, "markdown");
  assert.equal(md.size, 1);
});

test("an uploaded deck never overwrites one already there", () => {
  const dir = tempDir();
  const deck = path.join(dir, "deck.html");
  fs.writeFileSync(deck, "old");

  assert.deepEqual(saveUpload(dir, "new.html", Buffer.from("n"), false), { status: "created", name: "new.html" });
  assert.deepEqual(saveUpload(dir, "deck.html", Buffer.from("old"), false), { status: "same", name: "deck.html" });
  // Even when asked to replace, a deck lands beside its namesake.
  assert.deepEqual(saveUpload(dir, "deck.html", Buffer.from("v2"), true), { status: "renamed", name: "deck (2).html" });
  assert.deepEqual(saveUpload(dir, "deck.html", Buffer.from("v2"), false), { status: "same", name: "deck (2).html" });
  assert.deepEqual(saveUpload(dir, "deck.html", Buffer.from("v3"), false), { status: "renamed", name: "deck (3).html" });
  assert.equal(fs.readFileSync(deck, "utf-8"), "old");
  assert.equal(fs.existsSync(path.join(dir, BACKUP_DIR)), false);
});

test("an asset replaces its namesake only when asked, after a backup", () => {
  const dir = tempDir();
  const pic = path.join(dir, "pic.png");
  fs.writeFileSync(pic, "old");

  assert.deepEqual(saveUpload(dir, "pic.png", Buffer.from("new"), false), { status: "conflict", name: "pic.png" });
  assert.equal(fs.readFileSync(pic, "utf-8"), "old");

  const when = new Date(2026, 9, 11, 14, 30, 5);
  const first = saveUpload(dir, "pic.png", Buffer.from("new"), true, when);
  assert.deepEqual(first, { status: "replaced", name: "pic.png", backup: `${BACKUP_DIR}/pic.2026-10-11_143005.png` });
  assert.equal(fs.readFileSync(pic, "utf-8"), "new");
  assert.equal(fs.readFileSync(path.join(dir, first.backup), "utf-8"), "old");

  // A second replace in the same second keeps both backups.
  const second = saveUpload(dir, "pic.png", Buffer.from("newer"), true, when);
  assert.equal(second.backup, `${BACKUP_DIR}/pic.2026-10-11_143005-2.png`);
  assert.equal(fs.readFileSync(path.join(dir, second.backup), "utf-8"), "new");
});

test("uploads outside the folder's kinds of files are refused", () => {
  const dir = tempDir();
  for (const name of ["deck.zip", "run.cmd", "../escape.png", "no-extension"]) {
    assert.equal(saveUpload(dir, name, Buffer.from("x"), false).status, "refused", name);
  }
  assert.deepEqual(fs.readdirSync(dir), []);
  assert.ok(UPLOAD_ACCEPT.includes(".html") && UPLOAD_ACCEPT.includes(".png") && !UPLOAD_ACCEPT.includes(".zip"));
});

test("the files menu ships only when the editor is backed by a folder", () => {
  const file = { name: "talk.html", kind: "html", writable: true, watched: true };
  const withFolder = generateEditorHtml("nord", {}, "classic", "slide", { ...file, folder: "decks" });
  const without = generateEditorHtml("nord", {}, "classic", "slide", file);
  assert.ok(withFolder.includes('"folder":"decks"'));
  assert.ok(!without.includes('"folder"'));
  for (const html of [withFolder, without]) {
    assert.ok(html.includes('id="files-menu"'));
    assert.match(html, /#files-wrap \{ display: none; \}/);
    assert.ok(html.includes(`accept="${UPLOAD_ACCEPT}"`));
  }
  // Each request names its file, so tabs on different decks stay apart.
  assert.ok(withFolder.includes("fetch('/__file' + FILE_Q"));
  assert.ok(withFolder.includes("fetch('/__upload?name='"));
});
