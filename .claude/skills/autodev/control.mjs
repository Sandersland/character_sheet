/**
 * autodev control channel — Unix-socket server attached to the resident
 * daemon (autodevd.mjs), driven by the autodevctl.mjs client.
 *
 * Transport: Unix domain socket at .claude/autodev/autodevd.sock (no port
 * pressure — worktree ports are tight — and filesystem-permission secured).
 * Protocol: newline-delimited JSON, one request per connection:
 *   → {"id": 1, "verb": "status", "args": {}}
 *   ← {"id": 1, "ok": true, "data": {...}}   |   {"id": 1, "ok": false, "error": "..."}
 *
 * Handlers run on the daemon's event loop, interleaving with the tick at
 * await points — batch.json mutations can't race (single thread; the tick
 * body is synchronous). A tick's spawnSync gh polls can delay a response by
 * a few seconds; that's accepted. Mutating verbs take effect immediately in
 * batch.json; launch-shaped effects (add/retry/resume) land on the next tick.
 *
 * Startup reclaim: the pidfile check runs first (autodevd refuses to start
 * beside a live daemon), then a stale socket file (SIGKILL leftover) is
 * probed — connection refused/timeout → unlink and listen; a live listener →
 * hard error. The socket is unlinked on graceful shutdown.
 */
import { createServer, connect } from "node:net";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { parseIssueSpecs } from "./batch-core.mjs";
import { buildReport } from "./report.mjs";

/** Probe an existing socket file: resolves "live" | "stale". */
function probeSocket(sockPath) {
  return new Promise((resolvePromise) => {
    const c = connect(sockPath);
    const done = (verdict) => {
      c.destroy();
      resolvePromise(verdict);
    };
    c.once("connect", () => done("live"));
    c.once("error", () => done("stale"));
    setTimeout(() => done("stale"), 1000).unref();
  });
}

function tailFile(path, lines) {
  try {
    const content = readFileSync(path, "utf8").split("\n");
    return content.slice(Math.max(0, content.length - lines - 1)).join("\n");
  } catch {
    return null;
  }
}

/**
 * Attach the control server. `daemon` = { pid, startedAt, stateDir,
 * requestStop(mode) }. Returns the net.Server; caller closes + unlinks on
 * graceful shutdown (closeControl below wraps that).
 */
export async function attachControl({ engine, daemon, sockPath, log }) {
  if (existsSync(sockPath)) {
    if ((await probeSocket(sockPath)) === "live") {
      throw new Error(`another daemon is listening on ${sockPath}`);
    }
    unlinkSync(sockPath); // stale leftover from a SIGKILL'd daemon
    log(`CONTROL reclaimed stale socket ${sockPath}`);
  }

  const verbs = {
    ping: () => ({ pid: daemon.pid, uptimeMs: Date.now() - daemon.startedAt }),
    status: () => ({
      daemon: { pid: daemon.pid, startedAt: daemon.startedAt, stateDir: daemon.stateDir },
      ...engine.statusSnapshot(),
    }),
    add: (args) => {
      const specs = parseIssueSpecs(Array.isArray(args.specs) ? args.specs : [String(args.specs ?? "")]);
      engine.addIssues(specs);
      return { added: specs.map((s) => s.issue), note: "launches on the next tick, DAG/cap permitting" };
    },
    pause: (args) => {
      engine.pause(args.issue ?? null);
      return { paused: args.issue ?? "batch" };
    },
    resume: (args) => {
      engine.resumeWork(args.issue ?? null);
      return { resumed: args.issue ?? "batch" };
    },
    stop: (args) => {
      if (args.issue == null) throw new Error("stop requires an issue number");
      engine.stopIssue(Number(args.issue));
      return { stopping: Number(args.issue) };
    },
    retry: (args) => {
      if (args.issue == null) throw new Error("retry requires an issue number");
      engine.retryIssue(Number(args.issue));
      return { retrying: Number(args.issue) };
    },
    reconcile: () => engine.runJanitor(),
    logs: (args) => {
      if (args.issue == null) throw new Error("logs requires an issue number");
      const n = Number(args.issue);
      const lines = Number(args.lines ?? 50);
      const entry = engine.batch.issues[n];
      if (!entry) throw new Error(`issue #${n} is not in the batch`);
      const batchLog = join(daemon.stateDir, `issue-${n}.log`);
      return {
        batchLog,
        runLog: entry.rundir ? join(entry.rundir, "log.txt") : null,
        tail: tailFile(batchLog, lines) ?? "(no log yet)",
      };
    },
    report: () => buildReport(daemon.stateDir),
    shutdown: (args) => {
      // Respond first, then drain — the caller sees the ack before we go away.
      setTimeout(() => daemon.requestStop(args.park ? "park" : "wait"), 50).unref();
      return { draining: args.park ? "park" : "wait" };
    },
  };

  const server = createServer((socket) => {
    let buf = "";
    socket.on("data", (chunk) => {
      buf += chunk;
      const nl = buf.indexOf("\n");
      if (nl === -1) return;
      const line = buf.slice(0, nl);
      buf = "";
      let res;
      let id = null;
      try {
        const req = JSON.parse(line);
        id = req.id ?? null;
        const handler = verbs[req.verb];
        if (!handler) throw new Error(`unknown verb '${req.verb}' (have: ${Object.keys(verbs).join(", ")})`);
        res = { id, ok: true, data: handler(req.args ?? {}) };
      } catch (err) {
        res = { id, ok: false, error: err.message };
      }
      socket.end(JSON.stringify(res) + "\n");
    });
    socket.on("error", () => socket.destroy()); // client vanished mid-request
  });

  await new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise); // e.g. EADDRINUSE after unlink race
    server.listen(sockPath, resolvePromise);
  });
  log(`CONTROL listening on ${sockPath}`);
  return server;
}

/** Graceful shutdown: stop listening and remove the socket file. */
export function closeControl(server, sockPath) {
  try {
    server?.close();
  } catch {
    /* already closed */
  }
  try {
    unlinkSync(sockPath);
  } catch {
    /* already gone */
  }
}
