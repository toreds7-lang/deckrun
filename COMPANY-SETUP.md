# deckrun chat on the company PC: setup and fix guide

**For:** Claude Code running on the company PC, inside this repo.
**How to start:** the user says *"Read COMPANY-SETUP.md and follow it."* Work through the steps in order. When a step says **ASK**, stop and ask the user. Do not guess.

---

## 0. Context

deckrun is a local Node/TypeScript presentation tool (a fork, branch `feat/claude-chat`). `node dist\index.js <deck.html>` serves an editor at `http://127.0.0.1:7890`. **Ctrl+J** opens a chat panel. Each chat message runs one headless Claude Code turn. Claude edits the open deck file on disk, and the preview reloads.

| Piece | File | What it does |
|---|---|---|
| CLI lookup and turn runner | `src/chat.ts` | `findClaude()`, `chatArgs()`, `runChatTurn()`, `stopChat()`, `chatModelOk()` |
| Server routes | `src/index.ts` | `POST /__chat` (NDJSON stream), `/__chat/stop`, `/__chat/reset`, `/__look`; startup decides `mode.chat` |
| Client panel | `src/editor.ts` | Chat UI. **The whole client is one template literal, so every backslash in a regex is written twice.** |
| Pure client logic | `src/chat-kit.ts` | Slash commands, model list (`MODELS`), targeting, diffs |
| Tests | `test/*.test.mjs` | `node --test` after building |

A turn runs this command (cwd = the deck's folder; the message goes in on stdin):

```
claude -p --output-format stream-json --verbose --include-partial-messages
       --restricted --strict-mcp-config --tools Read Edit Write Glob Grep
       --settings {"permissions":{"allow":["Read","Glob","Grep","Edit(./<deck file>)"]}}
       --permission-mode dontAsk --append-system-prompt <one-line prompt>
       [--model <m>] [--resume <session>] [--input-format stream-json  (for /look images)]
```

**The chat panel appears only when all four are true:**
1. A file was given on the command line (a blank editor has no chat).
2. `--no-chat` was not passed.
3. `findClaude()` found a CLI **when the server started**.
4. The file name has no glob characters (`* ? [ ] { } \`).

Reference version: commit `d7629c7` on the user's home PC. The fixes in Step 3 were tested there on 2026-10-19 with Claude Code 2.1.288: all 60 tests pass, a real turn ran through npm's `claude.cmd`, and a fake company-style wrapper confirmed env forwarding and stop.

---

## 1. What we know about the company PC

- Claude Code is installed "globally" (probably `npm i -g @anthropic-ai/claude-code`). `claude -p "say hi"` **works in a terminal**.
- Claude reaches the model through **Bedrock, Vertex, or a company gateway**, not a claude.ai login.
- Symptom: **the chat is not enabled.** The user also edited the chat code here to try to fix it. Those edits did not help, and they may now be part of the problem.

## 2. Likely causes, most likely first

| # | Cause | What you see | Fix |
|---|---|---|---|
| 1 | `findClaude()` misses the CLI. It checks only `claude.exe` and `claude.cmd` on deckrun's own PATH plus `~\.local\bin`. A PATH set only in a PowerShell profile, a custom npm prefix, or a company wrapper that is a `.bat`, `.ps1`, alias, or function is all invisible to it. | No chat button, and nothing printed about chat at startup | Step 3a and 3e, Step 4 (`DECKRUN_CLAUDE`) |
| 2 | **`--restricted` ignores `~\.claude\settings.json`.** On a Bedrock/Vertex/gateway setup, that file often holds the `env` block (`CLAUDE_CODE_USE_BEDROCK`, `AWS_REGION`, `AWS_PROFILE`, `ANTHROPIC_BASE_URL`, proxy variables…) and `awsAuthRefresh` / `apiKeyHelper`. The terminal gets them; the chat turn does not. | Once the panel shows: an auth or credentials error, a `/login` message, a 403, "exited (code 1)", or a hang | Step 3b (forward them), or Step 4 (set them as real environment variables) |
| 3 | npm's `claude.cmd` sends every turn through `cmd.exe`. `/stop` then kills only `cmd.exe`, so Claude keeps running and the panel stays busy. cmd.exe quoting rules also apply. | Stop doesn't stop; later sends say "busy" | Step 3a (run the real `claude.exe`), 3c (kill the process tree) |
| 4 | `chatModelOk()` rejects Bedrock/Vertex model IDs. They contain `:`, `/`, or `@`, as in `us.anthropic.claude-sonnet-4-5-20250929-v1:0`, ARNs, or `claude-sonnet-4-5@20250929`. The aliases `opus`/`fable`/`haiku` may also map to models the company account hasn't enabled. | "'…' is not a model name", or a model or access-denied error | Step 3d; leave the model on `default` |
| 5 | The CLI is older than the flags deckrun uses (`--restricted`, `--tools`, `--include-partial-messages`, `--strict-mcp-config`). | "unknown option", exit code 1 | Update Claude Code; `--chat-check` lists the missing flags |
| 6 | Company managed settings deny `Edit` or limit models. These still apply under `--restricted`. | Claude replies, but the edits are "denied" | **ASK** the user / IT; don't work around policy |
| 7 | A proxy or a custom CA is set only in a shell profile or a wrapper. | Hangs, `ECONNRESET`, certificate errors | Step 3b or Step 4 |

---

## 3. Steps

### Step 1: Look at the company copy first

1. `git status` and `git log --oneline -5`. If `d7629c7` exists here, `git diff d7629c7 -- src/chat.ts src/index.ts src/editor.ts src/chat-kit.ts` shows the user's own fixes.
2. Summarize those local edits for the user in a few lines.
3. **ASK:** "Keep your earlier chat fixes, or set them aside (git stash / a copy) and start from the reference version?" Recommend setting them aside. They didn't work, and Step 3 replaces them.
4. Check the toolchain: `node -v` (20 or later preferred). Build with **`npx tsc`**, not `npm run build`: its `chmod` step fails on Windows.

### Step 2: Gather facts (read-only). Never print secret values.

Run these in PowerShell and keep the results for the final report:

```powershell
Get-Command claude -All | Format-List Name, CommandType, Source   # Application, Alias, Function, or ExternalScript?
where.exe claude
claude --version
claude --help | Select-String -Pattern 'restricted|--tools|include-partial|strict-mcp|permission-mode|--settings'
# Names only: values may be tokens
Get-ChildItem Env: | Where-Object Name -match '^(CLAUDE_CODE_|ANTHROPIC_|AWS_|CLOUD_ML|GOOGLE_|HTTPS?_PROXY|NO_PROXY|NODE_EXTRA_CA)' | Select-Object Name
Test-Path "$env:USERPROFILE\.claude\settings.json"
Test-Path "C:\Program Files\ClaudeCode\managed-settings.json"; Test-Path "C:\ProgramData\ClaudeCode\managed-settings.json"
```

Then:
- Read `%USERPROFILE%\.claude\settings.json`. Note which of `env`, `apiKeyHelper`, `awsAuthRefresh`, `awsCredentialExport`, and `model` it has, and which variable **names** sit under `env`. Don't echo their values.
- If `claude` is an **Alias, Function, or .ps1**, read its definition (`(Get-Command claude).Definition`, or the script file). It usually sets the provider variables. Write down which ones. Step 4 must reproduce them, because deckrun cannot run a PowerShell function.
- If a managed-settings file exists, read its `permissions` and `model` keys. A deny on `Edit` (cause 6) is for IT to change. **ASK** the user.
- Note how the user launches deckrun (`open-deck.cmd`? a shortcut? a terminal?) and from which folder.

### Step 3: Apply the code changes

Each part says *what* and *why*. Merge it into the current code; don't paste blindly over edits the user chose to keep. The code below is the tested version.

#### 3a. `src/chat.ts`: find the CLI more reliably and skip npm's cmd shim

Imports at the top become:

```ts
import { spawn, spawnSync, type ChildProcess } from "child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
```

Replace `findClaude()` and add `unwrapNpmShim()` right after it:

```ts
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
```

If the company's `claude.cmd` points at `...\claude-code\cli.js` instead of `bin\claude.exe`, the npm package is old. The shim then stays in use, which still works through `cmd.exe`, but updating Claude Code is better.

#### 3b. `src/chat.ts`: bring back the provider settings that `--restricted` drops

Add after `unwrapNpmShim()`:

```ts
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
```

`chatPermissions` and `chatArgs` take the extra settings:

```ts
export function chatPermissions(fileName: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...extra, permissions: { allow: ["Read", "Glob", "Grep", `Edit(./${fileName})`] } });
}

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
  // ...unchanged, except:
  //   "--settings", chatPermissions(fileName, extra),
```

In `runChatTurn()`, build the args with the provider settings, add a debug switch, and pass the env block to the child:

```ts
  const model = opts.model || process.env.DECKRUN_CLAUDE_MODEL || undefined;
  const provider = providerSettings();
  let args = chatArgs(fileName, opts.kind, sessions.get(opts.filePath) ?? null, model, !!opts.image, provider.settings);
  const debug = !!process.env.DECKRUN_CHAT_DEBUG;

  // ... (viaShell block and prompt unchanged) ...

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
```

In the same function, echo stderr and the exit code when debugging:

```ts
    child.stderr!.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-2000);
      if (debug) process.stderr.write(chunk.replace(/^/gm, "[chat:stderr] "));
    });
    // ...
    child.on("close", (code) => {
      running = null;
      if (debug) console.error(`[chat] exited with code ${code}`);
```

Side effect: a `model` in `settings.json` now applies when the chat's model chip says `default`. That matches what the README says `default` means.

#### 3c. `src/chat.ts`: make stop end the whole process tree

```ts
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
```

Keep the full path and the `error` handler. Without them, a PATH missing System32 crashes the whole server; this happened during testing.

#### 3d. Accept Bedrock and Vertex model IDs (server and client)

`src/chat.ts`:

```ts
/**
 * A model name or alias the CLI is given: letters, digits, and the
 * punctuation of model IDs, including Bedrock's (us.anthropic.…-v1:0, ARNs
 * with / in them) and Vertex's (…@20250929).
 */
export function chatModelOk(model: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._\-[\]:@/]{0,199}$/.test(model);
}
```

`src/editor.ts`, in the `/model` handler (search for `is not a model name`). Inside the template literal, the line must read **exactly** like this, with doubled backslashes:

```js
    if (!/^[A-Za-z0-9][A-Za-z0-9._:@\\/[\\]-]{0,199}$/.test(name)) {
```

`%`, `"`, spaces, and `;` stay rejected, since they matter on the `cmd.exe` path.

#### 3e. `deckrun --chat-check` and a visible "chat is off" message

Append to `src/chat.ts`:

```ts
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
```

`src/index.ts`:
- Import `chatCheck` along with the other names from `./chat.js`.
- Add the option after `--no-chat`: `.option("--chat-check", "Run one test chat turn with Claude Code, print what happens, and exit")`.
- Add `chatCheck?: boolean;` to the `opts` type.
- After the `listTransitions` block: `if (opts.chatCheck) { process.exit(await chatCheck()); }`
- Make the startup check say why chat is off instead of staying silent:

```ts
          if (opts.chat && findClaude()) {
            mode.chat = true;
            const blocked = chatBlockedReason(basename(absPath));
            if (blocked) console.log(`${c.dim}chat is off for this file: ${blocked}.${c.reset}`);
          } else if (opts.chat) {
            console.log(
              `${c.yellow}chat is off: Claude Code was not found. Set DECKRUN_CLAUDE to the path 'where.exe claude' prints, or run deckrun --chat-check.${c.reset}`
            );
          }
```

#### 3f. Tests: `test/chat-kit.test.mjs`, the "Only model names reach the CLI" test

```js
  for (const ok of ["sonnet", "opus", "claude-opus-4-1", "claude-sonnet-4-5-20250929", "sonnet[1m]", "us.anthropic.claude-sonnet-4-5-20250929-v1:0", "arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/abc123", "claude-sonnet-4-5@20250929"]) assert.ok(chatModelOk(ok), ok);
  for (const bad of ["", "-p", "a b", "x\"y", "sonnet;rm", "50%", "a".repeat(201)]) assert.ok(!chatModelOk(bad), bad);
```

Build and test: `npx tsc` then `node --test`. All tests must pass (60 on the reference version).

### Step 4: Set up the launcher

Use whatever Step 2 found. The rule: **anything `claude` needs in the terminal must also be in the environment deckrun starts in.** Double-clicking a `.cmd` does not run a PowerShell profile.

**ASK** the user for the deck folder and the default deck. Then write `open-deck.cmd` in the repo root. Keep it out of commits by adding `open-deck.cmd` to `.git/info/exclude`.

```bat
@echo off
rem Build deckrun and open a deck in the editor. Drag an .html/.md onto this file to open it.
setlocal
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0"

rem Only if --chat-check says NOT FOUND: the path 'where.exe claude' printed.
rem set "DECKRUN_CLAUDE=C:\Users\<you>\AppData\Roaming\npm\claude.cmd"

rem Only if the provider variables come from a PowerShell profile, function, or .ps1 wrapper
rem (Step 2). Copy the NAMES and values from there. If they are in settings.json, Step 3b covers them.
rem set "CLAUDE_CODE_USE_BEDROCK=1"
rem set "AWS_REGION=..."
rem set "AWS_PROFILE=..."

rem Optional: a fixed model for the chat (a Bedrock/Vertex ID works too).
rem set "DECKRUN_CLAUDE_MODEL=..."

set "DECK=%~1"
if "%DECK%"=="" set "DECK=<ASK: default deck path>"

call npx tsc
if errorlevel 1 goto fail
node dist\index.js "%DECK%"
if errorlevel 1 goto fail
goto :eof
:fail
echo Something went wrong. See the message above.
pause
```

Simpler and sturdier than a `.cmd`: store the provider variables as Windows **user** environment variables (`[Environment]::SetEnvironmentVariable("AWS_REGION", "...", "User")`). Every process started afterwards sees them, Explorer included. Tokens are an exception: **ASK** before persisting anything secret.

### Step 5: Verify

1. `node dist\index.js --chat-check` should end with `chat works (… ms).` It spends one tiny turn.
2. If it fails, run it again with debug on and read the `[chat:stderr]` lines:
   ```powershell
   $env:DECKRUN_CHAT_DEBUG = "1"; node dist\index.js --chat-check
   ```
3. Copy a deck to a test folder; never test on the user's real decks first. Open it with `open-deck.cmd` and check:
   - the console does **not** say "chat is off", and Ctrl+J opens the panel
   - "Make the title on this slide shorter" edits the file, and the preview updates
   - `undo` restores it
   - `/stop` during a long request ends it, and the next message isn't refused as busy
   - `/model <company model ID>` is accepted (only if the user wants a non-default model)
   - `/look` needs Edge or Chrome. Edge is normally found; otherwise set `DECKRUN_BROWSER` to `msedge.exe`.

### Step 6: Report to the user

Briefly: what Step 2 found (no secret values), which cause from section 2 it was, what changed, and the final `--chat-check` output.

---

## 4. Troubleshooting

| You see | Likely cause | Do |
|---|---|---|
| `chat is off: Claude Code was not found` | Cause 1 | Set `DECKRUN_CLAUDE` to the path from `where.exe claude`. If `claude` is a PowerShell function or alias, point it at the real `claude.exe` and recreate the function's variables (Step 4). |
| No "chat is off" line, but no panel either | No file on the command line, `--no-chat`, or an old build | Open a file from the CLI. Rebuild **and restart**: the server bakes `dist/editor.js` in at startup. |
| `chat is off for this file: … glob characters` | Cause 1, file-name variant | Rename the deck (no `[ ] { } * ?`). |
| `MISSING FLAGS: …` | Cause 5 | `claude update`, or `npm i -g @anthropic-ai/claude-code`. If IT pins the version, **ASK**. |
| Mentions `/login`, API key, credentials, 403, `AccessDenied`, region | Cause 2 | Check that `set for the turn:` lists the provider variables. If it doesn't, they live somewhere deckrun can't see: Step 4. |
| `No answer after 180 s` | Cause 7, or an SSO sign-in waiting | Run `aws sso login` (or the company's sign-in) in a terminal first; check the proxy and CA variables reach the turn. |
| `result: ok`, but `denied: Edit …` | Cause 6, or a path or permission-rule problem | Check managed settings. Don't widen the rules beyond `Edit(./<file>)`. |
| A model or access error after `/model x` | Cause 4 | Use `default`, or the exact ID the company enabled. |

---

## 5. Rules: keep these intact

- **Keep the confinement.** `--restricted`, the `--tools` list, the single `Edit(./<file>)` rule passed through `--settings`, and `--permission-mode dontAsk`. Never forward `permissions`, `hooks`, or `mcpServers` from the user's settings. Never switch to `bypassPermissions` or `--dangerously-skip-permissions` to "make it work".
- Never print, log, or commit the **values** of tokens or keys. Names are fine.
- The appended system prompt stays **one line with no `"` and no `%`**, because the `cmd.exe` path depends on it. A test enforces this.
- `src/editor.ts` is a template literal: write regex backslashes twice. Tools that write files may also turn `\uXXXX` into the literal character there.
- When a turn goes through `cmd.exe`, the `--settings` JSON goes in a temp file (the existing code does this). Keep that.
- Rebuild with `npx tsc`, then restart the server before testing the UI.
- Test on copies of decks.

---

## 6. Better methods

1. **Recommended (this guide):** keep `claude -p`. It already works on that PC and inherits the company's login, provider, and policy, so deckrun never handles a credential. The fixes above remove the three Windows/enterprise traps: lookup, settings dropped by `--restricted`, and `cmd.exe`. `--chat-check` turns the next breakage into a one-command diagnosis.
2. **Put the provider configuration where every process sees it,** not in a shell profile or a wrapper: user environment variables, or (best) **managed settings deployed by IT**. Managed settings apply even under `--restricted`, so deckrun and every other tool work without per-app setup.
3. **Prefer a real `claude.exe`** (the native installer, or npm's `bin\claude.exe`) over `.cmd`/`.ps1` wrappers. Step 3a does this automatically for npm's shim.
4. **Later, if the chat grows:** replace the hand-written `spawn` with the Claude Agent SDK for TypeScript (`@anthropic-ai/claude-agent-sdk`). It gives typed messages, an env option, and a `canUseTool` callback that can allow edits to one exact path, with no glob rule. Costs: a new dependency (npm registry access at the company), and rewriting `runChatTurn` (~150 lines). Check the SDK's current docs before starting.
5. **Not recommended:** calling Bedrock directly with the AWS SDK. You would rebuild Read/Edit tools, sessions, permissions, and image input yourself, and lose everything Claude Code already gives you there.
