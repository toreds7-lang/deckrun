import { spawn, spawnSync, type ChildProcess } from "child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { homedir, tmpdir } from "os";
import { basename, delimiter, dirname, join, relative } from "path";

/**
 * The editor's chat panel: each message runs one headless Claude Code turn
 * (`claude -p`) against the file the editor is backed by.
 *
 * It rides on whatever `claude` is already signed in with — a Pro/Max
 * subscription or an API key — so deckrun never sees a credential. The turn
 * is confined on purpose:
 *
 * - `--restricted` drops every tool that runs code and ignores the person's
 *   own settings files, so a broad allow rule there cannot widen this.
 * - `--tools` leaves only reading and editing files.
 * - One `Edit(./<file>)` rule lets it change the open file and nothing else.
 * - `dontAsk` turns anything outside that into a denial, rather than a
 *   permission prompt nobody is there to answer.
 *
 * The edit lands on disk and the existing file watcher reloads the editor,
 * so the preview updates as Claude works.
 */

/** One line of the NDJSON stream the editor reads back from /__chat. */
export type ChatEvent =
  | { type: "session"; id: string }
  | { type: "text"; text: string }
  | { type: "tool"; name: string; target: string }
  | { type: "done"; ok: boolean; text: string; ms: number; denied: string[] }
  | { type: "error"; message: string };

let cachedClaude: string | null | undefined;

/**
 * Finds the Claude Code CLI. `DECKRUN_CLAUDE` wins; then PATH; then the
 * native installer's default location, which is often missing from PATH.
 */
export function findClaude(): string | null {
  if (cachedClaude !== undefined) return cachedClaude;
  const override = process.env.DECKRUN_CLAUDE;
  if (override) return (cachedClaude = existsSync(override) ? unwrapNpmShim(override) : null);

  const names = process.platform === "win32" ? ["claude.exe", "claude.cmd", "claude.bat"] : ["claude"];
  const dirs = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  dirs.push(join(homedir(), ".local", "bin"));
  // npm's default global folder, which a PATH set up only in a shell profile can leave out.
  if (process.platform === "win32" && process.env.APPDATA) dirs.push(join(process.env.APPDATA, "npm"));
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return (cachedClaude = unwrapNpmShim(candidate));
    }
  }
  return (cachedClaude = null);
}

/**
 * npm's claude.cmd only forwards to the package's own claude.exe. Running
 * that directly skips cmd.exe: no quoting rules, no 8191-character limit,
 * and stop ends Claude rather than the shell around it. Any other .cmd or
 * .bat (a company wrapper that sets up Bedrock, say) is kept as it is.
 */
export function unwrapNpmShim(path: string): string {
  if (!/\.cmd$/i.test(path)) return path;
  let text = "";
  try {
    text = readFileSync(path, "utf-8");
  } catch {
    return path;
  }
  if (!/node_modules\\@anthropic-ai\\claude-code\\bin\\claude\.exe/i.test(text)) return path;
  const exe = join(dirname(path), "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe");
  return existsSync(exe) ? exe : path;
}

/**
 * The parts of the person's own Claude Code settings that say how to reach
 * the model: the env block (Bedrock, Vertex, a gateway, a proxy) and the
 * auth helpers. --restricted ignores the user settings file, so without
 * these a turn cannot sign in where the terminal can. Permissions, hooks,
 * and MCP servers stay out, so the confinement holds.
 */
export function providerSettings(): { env: Record<string, string>; settings: Record<string, unknown> } {
  const out = { env: {} as Record<string, string>, settings: {} as Record<string, unknown> };
  const dir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
  let user: any;
  try {
    user = JSON.parse(readFileSync(join(dir, "settings.json"), "utf-8"));
  } catch {
    return out;
  }
  if (user?.env && typeof user.env === "object") {
    for (const [key, value] of Object.entries(user.env)) {
      if (typeof value === "string") out.env[key] = value;
    }
  }
  for (const key of ["apiKeyHelper", "awsAuthRefresh", "awsCredentialExport", "model"]) {
    if (user?.[key] !== undefined) out.settings[key] = user[key];
  }
  return out;
}

/**
 * Why chat cannot edit this file name, or null when it can. A permission
 * rule is a glob, so a name with glob characters in it could match more than
 * the one file it is meant to.
 */
export function chatBlockedReason(fileName: string): string | null {
  if (/[*?[\]{}\\]/.test(fileName)) {
    return `the file name '${fileName}' contains glob characters, so it cannot be confined to one file`;
  }
  return null;
}

function systemPrompt(fileName: string, kind: "markdown" | "html"): string {
  const format =
    kind === "html"
      ? `It is a self-contained HTML document (it may be a slide deck with its own script); keep it self-contained and keep its existing styles, scripts, and structure unless asked.`
      : `It is a Markdown slide deck: slides are separated by lines of three dashes, and speaker notes live in <!-- note: ... --> comments.`;
  // One line on purpose: a .cmd launcher goes through cmd.exe, where a
  // newline inside an argument would end the command. No double quotes
  // either, since that launcher wraps each argument in them.
  return [
    `You are the editing assistant inside deckrun, a local presentation tool.`,
    `The person is looking at ${fileName} in deckrun's editor, with a live preview beside this chat.`,
    format,
    `${fileName} is the only file you can change; the other files in this folder (images and so on) can be read but not modified, and there is no shell.`,
    `Each message starts with a <deckrun-context> block from deckrun naming the target: the slide in the preview, anything narrower the person singled out (code or text they selected, or the element at their cursor), the line numbers, and usually the slide's source.`,
    `A request that names no place (this, it, here, the title) is about that target: change only it, and leave other slides alone unless the message names them or the whole deck.`,
    `To edit, Read just the target's line range (with offset and limit) rather than the whole file.`,
    `When asked for a change, make it directly in ${fileName} with targeted edits rather than rewriting the whole file, then say in one or two sentences what changed.`,
    `When a picture of the slide comes with a message, it is how the slide renders: judge layout from it (text that overflows, is cut off, overlaps, or is too small, and alignment), and since you cannot see the result of an edit, say what the person should check.`,
    `If a request is ambiguous in a way that matters (which element or slide, or how far to go) and a wrong guess would have to be undone, do not edit: ask one short question, and end the reply with the likely answers, one per line, between <choices> and </choices>. Settle small details yourself and mention them.`,
    `When asked a question, answer it without editing.`,
    `Reply in the language the person writes in.`,
  ].join(" ");
}

/**
 * The allow rules, as a settings document. They go through --settings rather
 * than --allowedTools because the CLI splits that flag's value on spaces and
 * loses track of parentheses, so a name like "talk (v2) final.html" would
 * become a rule that matches nothing.
 */
export function chatPermissions(fileName: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...extra, permissions: { allow: ["Read", "Glob", "Grep", `Edit(./${fileName})`] } });
}

/**
 * A model name or alias the CLI is given: letters, digits, and the
 * punctuation of model IDs, including Bedrock's (us.anthropic.…-v1:0, ARNs
 * with / in them) and Vertex's (…@20250929).
 */
export function chatModelOk(model: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._\-[\]:@/]{0,199}$/.test(model);
}

/** The argv for one turn. Exported for tests. */
export function chatArgs(
  fileName: string,
  kind: "markdown" | "html",
  sessionId: string | null,
  model?: string,
  // The message arrives as a stream-json user message, which can carry an image.
  structured = false,
  // Settings that go along with the permissions, from providerSettings().
  extra: Record<string, unknown> = {}
): string[] {
  const args = [
    "-p",
    ...(structured ? ["--input-format", "stream-json"] : []),
    "--output-format", "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--restricted",
    "--strict-mcp-config",
    "--tools", "Read", "Edit", "Write", "Glob", "Grep",
    "--settings", chatPermissions(fileName, extra),
    "--permission-mode", "dontAsk",
    "--append-system-prompt", systemPrompt(fileName, kind),
  ];
  if (model) args.push("--model", model);
  if (sessionId) args.push("--resume", sessionId);
  return args;
}

/** A short, cwd-relative description of what a tool call touches. */
function toolTarget(input: Record<string, unknown> | undefined, cwd: string): string {
  if (!input) return "";
  const path = typeof input.file_path === "string" ? input.file_path : null;
  if (path) {
    const rel = relative(cwd, path);
    return rel && !rel.startsWith("..") ? rel.replace(/\\/g, "/") : basename(path);
  }
  if (typeof input.pattern === "string") return input.pattern;
  return "";
}

/**
 * Maps one `stream-json` message from `claude -p` to what the panel shows.
 * Text arrives as partial deltas; tool calls arrive whole on the assistant
 * message; denials are tallied on the final result. Exported for tests.
 */
export function chatEvents(msg: any, cwd: string): ChatEvent[] {
  if (!msg || typeof msg !== "object") return [];
  if (msg.type === "system" && msg.subtype === "init" && typeof msg.session_id === "string") {
    return [{ type: "session", id: msg.session_id }];
  }
  if (msg.parent_tool_use_id) return [];
  if (msg.type === "stream_event") {
    const ev = msg.event;
    if (ev?.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) {
      return [{ type: "text", text: ev.delta.text }];
    }
    return [];
  }
  if (msg.type === "assistant" && Array.isArray(msg.message?.content)) {
    return msg.message.content
      .filter((block: any) => block?.type === "tool_use")
      .map((block: any) => ({ type: "tool", name: String(block.name), target: toolTarget(block.input, cwd) }));
  }
  if (msg.type === "result") {
    const denied = Array.isArray(msg.permission_denials)
      ? msg.permission_denials.map(
          (d: any) => `${d.tool_name}${toolTarget(d.tool_input, cwd) ? " " + toolTarget(d.tool_input, cwd) : ""}`
        )
      : [];
    return [{
      type: "done",
      ok: msg.subtype === "success" && !msg.is_error,
      text: typeof msg.result === "string" ? msg.result : "",
      ms: typeof msg.duration_ms === "number" ? msg.duration_ms : 0,
      denied,
    }];
  }
  return [];
}

/**
 * What goes to the CLI's stdin: the text as is, or, with a picture, one
 * stream-json user message holding both. Exported for tests.
 */
export function chatInput(text: string, image?: Buffer): string {
  if (!image) return text;
  return JSON.stringify({
    type: "user",
    message: {
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/png", data: image.toString("base64") } },
        { type: "text", text },
      ],
    },
    parent_tool_use_id: null,
    session_id: "",
  }) + "\n";
}

let settingsPath: string | null = null;

/** Writes the settings JSON to a temp file, removed when deckrun exits. */
function settingsFile(json: string): string {
  if (!settingsPath) {
    settingsPath = join(tmpdir(), `deckrun-chat-${process.pid}.json`);
    const path = settingsPath;
    process.on("exit", () => {
      try {
        rmSync(path, { force: true });
      } catch {}
    });
  }
  writeFileSync(settingsPath, json, "utf-8");
  return settingsPath;
}

// One conversation per file, kept while the editor switches between decks;
// one turn at a time across the server.
const sessions = new Map<string, string>();
let running: ChildProcess | null = null;
let stopped = false;

export function chatBusy(): boolean {
  return running !== null;
}

/** Forgets the file's conversation, so its next message starts a fresh one. */
export function resetChat(filePath: string): void {
  sessions.delete(filePath);
}

/** Stops the turn in flight. Edits it already made stay on disk. */
export function stopChat(): boolean {
  if (!running) return false;
  stopped = true;
  const child = running;
  if (process.platform === "win32" && child.pid) {
    // Through a .cmd the child is cmd.exe; /T ends Claude under it as well.
    // By full path, since PATH can lack System32 in a launcher's environment.
    const taskkill = join(process.env.SystemRoot || "C:\\Windows", "System32", "taskkill.exe");
    spawn(taskkill, ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" })
      .on("error", () => child.kill());
  } else {
    child.kill();
  }
  return true;
}

/** Runs one turn and streams its events through `send` until it ends. */
export function runChatTurn(opts: {
  filePath: string;
  kind: "markdown" | "html";
  message: string;
  context?: string;
  /** Overrides DECKRUN_CLAUDE_MODEL for this turn. */
  model?: string;
  /** A PNG of the slide, for /look. */
  image?: Buffer;
  send: (event: ChatEvent) => void;
}): Promise<void> {
  const claude = findClaude();
  if (!claude) {
    opts.send({ type: "error", message: "Claude Code was not found. Install it, or point DECKRUN_CLAUDE at it." });
    return Promise.resolve();
  }
  const cwd = dirname(opts.filePath);
  const fileName = basename(opts.filePath);
  const model = opts.model || process.env.DECKRUN_CLAUDE_MODEL || undefined;
  const provider = providerSettings();
  let args = chatArgs(fileName, opts.kind, sessions.get(opts.filePath) ?? null, model, !!opts.image, provider.settings);
  const debug = !!process.env.DECKRUN_CHAT_DEBUG;

  // Node refuses to spawn a .cmd without a shell, and the shell joins argv
  // unquoted. Windows file names cannot hold a double quote, so wrapping
  // each argument in quotes is enough — except the settings JSON, which is
  // full of them and goes in a file instead.
  const viaShell = /\.(cmd|bat)$/i.test(claude);
  if (viaShell) {
    const at = args.indexOf("--settings") + 1;
    args[at] = settingsFile(args[at]);
    args = args.map((a) => `"${a}"`);
  }

  const prompt = chatInput(
    opts.context
      ? `<deckrun-context>\n${opts.context}\n</deckrun-context>\n\n${opts.message}`
      : opts.message,
    opts.image
  );

  if (debug) {
    const shown = args.map((a) => (a.length > 120 ? a.slice(0, 117) + "..." : a));
    console.error(`[chat] ${claude}${viaShell ? " (through cmd.exe)" : ""} in ${cwd}\n[chat]   ${shown.join(" ")}`);
    console.error(`[chat] env from settings.json: ${Object.keys(provider.env).join(", ") || "none"}`);
  }

  return new Promise((resolveTurn) => {
    let child: ChildProcess;
    try {
      child = spawn(viaShell ? `"${claude}"` : claude, args, {
        cwd,
        // The env block from settings.json, which --restricted would drop.
        // It goes here rather than into --settings so that tokens in it stay
        // off the command line.
        env: { ...process.env, ...provider.env },
        shell: viaShell,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err) {
      opts.send({ type: "error", message: `Could not start Claude Code: ${(err as Error).message}` });
      resolveTurn();
      return;
    }
    running = child;
    stopped = false;

    let finished = false;
    let buffered = "";
    let stderr = "";

    child.stdout!.setEncoding("utf-8");
    child.stdout!.on("data", (chunk: string) => {
      buffered += chunk;
      let nl: number;
      while ((nl = buffered.indexOf("\n")) >= 0) {
        const line = buffered.slice(0, nl).trim();
        buffered = buffered.slice(nl + 1);
        if (!line) continue;
        let msg: unknown;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        for (const event of chatEvents(msg, cwd)) {
          if (event.type === "session") sessions.set(opts.filePath, event.id);
          if (event.type === "done") finished = true;
          opts.send(event);
        }
      }
    });
    child.stderr!.setEncoding("utf-8");
    child.stderr!.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-2000);
      if (debug) process.stderr.write(chunk.replace(/^/gm, "[chat:stderr] "));
    });

    child.on("error", (err) => {
      opts.send({ type: "error", message: `Could not start Claude Code: ${err.message}` });
    });
    child.on("close", (code) => {
      running = null;
      if (debug) console.error(`[chat] exited with code ${code}`);
      if (!finished) {
        if (stopped) {
          opts.send({ type: "error", message: "Stopped. Edits made before the stop are kept." });
        } else {
          // A failed resume would fail every later turn the same way.
          sessions.delete(opts.filePath);
          const detail = stderr.trim().split("\n").slice(-3).join(" ").trim();
          opts.send({
            type: "error",
            message: `Claude Code exited (code ${code ?? "?"})${detail ? ": " + detail : ""}. The next message starts a new chat.`,
          });
        }
      }
      resolveTurn();
    });

    child.stdin!.on("error", () => {});
    child.stdin!.end(prompt, "utf-8");
  });
}

/**
 * `deckrun --chat-check`: finds Claude Code the way the server does, checks
 * that it knows every flag a turn uses, then runs one real turn on a scratch
 * file and prints what came back. Exits 0 when the turn succeeds.
 */
export async function chatCheck(log: (line: string) => void = console.log): Promise<number> {
  const claude = findClaude();
  if (!claude) {
    log("claude: NOT FOUND. Run 'where.exe claude' where claude works and set DECKRUN_CLAUDE to that path.");
    return 1;
  }
  const viaShell = /\.(cmd|bat)$/i.test(claude);
  log(`claude: ${claude}${viaShell ? " (through cmd.exe)" : ""}`);

  const help = spawnSync(viaShell ? `"${claude}"` : claude, ["--help"], {
    shell: viaShell,
    encoding: "utf-8",
    windowsHide: true,
    timeout: 60000,
  });
  const version = spawnSync(viaShell ? `"${claude}"` : claude, ["--version"], {
    shell: viaShell,
    encoding: "utf-8",
    windowsHide: true,
    timeout: 60000,
  });
  log(`version: ${(version.stdout || version.stderr || "?").trim()}`);
  const flags = [...chatArgs("x.md", "markdown", "s", "m", true), "--resume", "--model"].filter((a) => a.startsWith("--"));
  const missing = [...new Set(flags)].filter((f) => !(help.stdout ?? "").includes(f));
  if (missing.length) {
    log(`MISSING FLAGS: ${missing.join(" ")}. Update Claude Code (claude update, or npm i -g @anthropic-ai/claude-code).`);
    return 1;
  }

  const provider = providerSettings();
  log(`from ~/.claude/settings.json: env [${Object.keys(provider.env).join(", ")}] settings [${Object.keys(provider.settings).join(", ")}]`);
  const env = { ...process.env, ...provider.env };
  const routes = ["CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "ANTHROPIC_BASE_URL", "ANTHROPIC_MODEL",
    "AWS_REGION", "AWS_PROFILE", "CLOUD_ML_REGION", "HTTPS_PROXY", "NODE_EXTRA_CA_CERTS"];
  log(`set for the turn: ${routes.filter((k) => env[k] !== undefined).join(", ") || "none of the provider variables"}`);

  const dir = mkdtempSync(join(tmpdir(), "deckrun-check-"));
  const file = join(dir, "check.md");
  writeFileSync(file, "# Check\n\nHello\n", "utf-8");
  const started = Date.now();
  let ok = false;
  let reply = "";
  const timer = setTimeout(() => {
    log("No answer after 180 s: often a proxy or firewall, or a sign-in waiting in a browser. Stopping.");
    stopChat();
  }, 180000);
  await runChatTurn({
    filePath: file,
    kind: "markdown",
    message: "This is a connection test from deckrun. Reply with the single word OK and do not edit anything.",
    send: (event) => {
      if (event.type === "text") reply += event.text;
      else if (event.type === "session") log(`session: ${event.id}`);
      else if (event.type === "error") log(`ERROR: ${event.message}`);
      else if (event.type === "done") {
        ok = event.ok;
        log(`result: ${event.ok ? "ok" : "failed"} in ${event.ms} ms: ${(event.text || reply).trim().slice(0, 300)}`);
        if (event.denied.length) log(`denied: ${event.denied.join(", ")}`);
      }
    },
  });
  clearTimeout(timer);
  rmSync(dir, { recursive: true, force: true });
  log(ok ? `chat works (${Date.now() - started} ms).` : "chat FAILED. Run again with DECKRUN_CHAT_DEBUG=1 to see Claude Code's full output.");
  return ok ? 0 : 1;
}
