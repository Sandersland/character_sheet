#!/usr/bin/env node
/**
 * PreToolUse guard: keep image/screenshot artifacts out of the project tree.
 *
 * This exists because Playwright UI verification and ad-hoc image writes have
 * repeatedly dumped .png screenshots into the repo root and feature folders
 * (complained about across ~20 sessions). Prompt-level reminders to "use /tmp"
 * never durably held, so this enforces it: any attempt to write an image file
 * *inside the project* — or take a Playwright screenshot without an absolute
 * non-repo path — is blocked with an instruction to target the scratchpad/tmp.
 *
 * Wired in .claude/settings.json for Write|Edit|NotebookEdit, Bash, and the
 * Playwright screenshot MCP tool. The Bash arm closes the gap the file-writing
 * tools miss: shell redirections (`> shot.png`), copies/moves (`cp x.png
 * frontend/`), and capture flags (`--output shot.png`, `screencapture`) that
 * drop images into the tree without ever touching Write/Edit. Exit 2 + stderr =
 * block and show the message to the model.
 */
import { normalize, isAbsolute } from "node:path";

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"];
// Locations that are always fine to write artifacts into. The temp prefixes
// already cover the session scratchpad (it lives under /private/tmp); the
// "/scratchpad/" substring is a belt-and-suspenders catch for any other
// scratchpad path. (.svg is intentionally NOT blocked — it's a legit frontend
// source asset, not a screenshot artifact.)
const ALLOWED_PREFIXES = ["/tmp", "/private/tmp", "/var/folders"];
// e2e visual-regression baselines are checked-in source fixtures, not artifacts.
const ALLOWED_SUBSTRINGS = ["/scratchpad/", "/e2e/__screenshots__/"];

function isAllowed(path) {
  const p = path.replace(/\\/g, "/");
  if (ALLOWED_PREFIXES.some((prefix) => p.startsWith(prefix))) return true;
  if (ALLOWED_SUBSTRINGS.some((s) => p.includes(s))) return true;
  return false;
}

function hasImageExt(path) {
  const low = path.toLowerCase();
  return IMAGE_EXTS.some((ext) => low.endsWith(ext));
}

function inProject(path, projectDir) {
  // Relative paths resolve against the project (cwd); absolute paths must sit
  // under the project root to count as "polluting the tree".
  if (!isAbsolute(path)) return true;
  return normalize(path).startsWith(normalize(projectDir));
}

// Pull likely image *destination* paths out of a shell command. Deliberately
// narrow to write intents so reads (`cat foo.png`, `file logo.png`) don't trip
// it: redirections, explicit output flags, and the trailing dest of a
// copy/move/capture. Quoted args are unwrapped.
function bashImageTargets(command) {
  const targets = [];
  const strip = (s) => s.replace(/^['"]|['"]$/g, "");

  // 1) redirection into an image file:  > shot.png   >> shot.png
  const redir = /(?:^|[^0-9&>])>>?\s*('[^']+'|"[^"]+"|[^\s;|&<>]+)/g;
  let m;
  while ((m = redir.exec(command)) !== null) {
    const t = strip(m[1]);
    if (hasImageExt(t)) targets.push(t);
  }

  // 2) explicit output flags:  --output shot.png   -o shot.png   --path shot.png
  const flag = /(?:--output|--path|--screenshot|-o|-O)[=\s]+('[^']+'|"[^"]+"|[^\s;|&<>]+)/g;
  while ((m = flag.exec(command)) !== null) {
    const t = strip(m[1]);
    if (hasImageExt(t)) targets.push(t);
  }

  // 3) copy/move/capture: the destination is the last image-ext token on the
  // line, so an in-tree *source* copied out to /tmp is not flagged.
  if (/\b(cp|mv|install|rsync|screencapture|convert|magick)\b/.test(command)) {
    const toks = command.match(/('[^']+'|"[^"]+"|[^\s;|&<>]+)/g) ?? [];
    const imgs = toks.map(strip).filter(hasImageExt);
    if (imgs.length > 0) targets.push(imgs[imgs.length - 1]);
  }

  return targets;
}

function block(message) {
  process.stderr.write(message + "\n");
  process.exit(2);
}

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(data));
  });
}

const raw = await readStdin();

let payload;
try {
  payload = JSON.parse(raw);
} catch {
  process.exit(0); // never break the tool call on a parse hiccup
}

const tool = payload.tool_name ?? "";
const ti = payload.tool_input ?? {};
const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

// 1) File-writing tools: block image files written into the repo.
if (tool === "Write" || tool === "Edit" || tool === "NotebookEdit") {
  const path = ti.file_path ?? ti.notebook_path ?? "";
  if (path && hasImageExt(path) && inProject(path, projectDir) && !isAllowed(path)) {
    block(
      `Blocked: '${path}' would write an image artifact into the project tree.\n` +
        "Image/screenshot artifacts must go to the scratchpad or /tmp, never the repo.\n" +
        "Re-target the file under /tmp (or the session scratchpad dir) and retry.",
    );
  }
}

// 2) Bash: block shell commands that drop image artifacts into the repo tree.
if (tool === "Bash") {
  const command = ti.command ?? "";
  // `git`/`gh` never emit an image artifact from their argv — a `.png` token in
  // one is commit/PR prose or a path arg (e.g. a commit body describing the very
  // patterns this hook forbids). Skip them so we don't block legit VCS calls.
  const firstToken = command.trimStart().split(/\s+/)[0] ?? "";
  const isVcsCommand = firstToken === "git" || firstToken === "gh";
  for (const target of isVcsCommand ? [] : bashImageTargets(command)) {
    if (inProject(target, projectDir) && !isAllowed(target)) {
      block(
        `Blocked: this command would write an image artifact ('${target}') into the project tree.\n` +
          "Image/screenshot artifacts must go to the scratchpad or /tmp, never the repo.\n" +
          "Re-target the output under /tmp (or the session scratchpad dir) and retry.",
      );
    }
  }
}

// 3) Playwright screenshots: require an allowed (tmp/scratchpad) destination.
// isAllowed already excludes every project-tree path, so no separate inProject
// check is needed here.
if (tool.endsWith("browser_take_screenshot")) {
  const fname = ti.filename ?? "";
  if (!fname || !isAllowed(fname)) {
    block(
      "Blocked: Playwright screenshot must save to an absolute /tmp path, " +
        "not the project tree.\n" +
        "Pass filename as an absolute path under /tmp (or the session scratchpad), " +
        "e.g. /tmp/verify-<name>.png, and retry.",
    );
  }
}

process.exit(0);
