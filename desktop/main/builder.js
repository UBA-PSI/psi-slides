// The build process manager: exactly one child at a time, started as plain
// Node inside Electron's own binary, spoken to over stdin and listened to on
// stdout.
//
// The three functions above the class are pure and exported for the tests.
// That split is the point of the file: everything that decides what a line
// means and what a state becomes can be checked without a display, a child
// process or a clock, and only the plumbing needs Electron.
//
// This file must not require('electron'). It is loaded by
// desktop/test/events.test.mjs under a bare `node --test`.

const { spawn } = require('node:child_process');
const path = require('node:path');

// Enough log to send a bug report with, little enough that a long-running
// watch cannot grow without bound. Oldest lines go first, so the end of the
// log – which is where the failure is – always survives.
const LOG_CAP = 2000;

// Splits whatever arrived from a pipe into whole lines, keeping the tail for
// the next chunk. A build event can be several kilobytes (a stack trace), so
// assuming that a chunk boundary is a line boundary would silently drop the
// one event the app most needs to show.
function splitLines(pending, chunk) {
  const text = pending + chunk;
  const parts = text.split('\n');
  const rest = parts.pop();
  return { lines: parts.map(l => (l.endsWith('\r') ? l.slice(0, -1) : l)), rest };
}

// An event is a line that starts with `{"type":` and parses as JSON. That is
// build.js's own contract, and the narrowness is deliberate: a log line that
// happens to begin with a brace stays a log line, and a truncated event stays
// a log line rather than becoming a half-applied state change.
function classifyLine(line) {
  if (line.startsWith('{"type":')) {
    try {
      const event = JSON.parse(line);
      if (event && typeof event === 'object' && typeof event.type === 'string') {
        return { kind: 'event', event, line };
      }
    } catch {
      // Falls through to the log below, where a person can still read it.
    }
  }
  return { kind: 'log', line };
}

function initialState() {
  return {
    phase: 'closed',
    source: null,
    dir: null,
    name: null,
    lastSuccess: null,
    lastError: null,
    changedSinceBuild: false,
    auto: true,
    serve: { enabled: false, url: null },
    embeds: 0,
    browser: { kind: 'default', name: '' },
    log: [],
  };
}

// The state machine of the plan's build-state model, as one pure function.
// `now` is a parameter so a test can assert on a timestamp rather than on
// whatever the clock said.
//
// Two invariants live here and nowhere else: a success clears `lastError`,
// and an error does not clear `lastSuccess`. The second one is the promise
// the interface makes when it says the views still show the last good build.
function reduceState(state, event, now = Date.now()) {
  switch (event.type) {
    case 'watching':
      return {
        ...state,
        source: event.source || state.source,
        dir: event.dir || state.dir,
        name: event.dir ? path.basename(event.dir) : state.name,
        auto: typeof event.auto === 'boolean' ? event.auto : state.auto,
      };
    case 'serving':
      return { ...state, serve: { enabled: true, url: event.url || null } };
    case 'build-start':
      return { ...state, phase: 'building' };
    case 'build-success':
      return {
        ...state,
        phase: 'ready',
        lastError: null,
        changedSinceBuild: false,
        embeds: typeof event.embeds === 'number' ? event.embeds : state.embeds,
        lastSuccess: {
          at: now,
          durationMs: typeof event.durationMs === 'number' ? event.durationMs : 0,
          views: Array.isArray(event.views) ? event.views.slice() : [],
          shape: typeof event.shape === 'string' ? event.shape : '',
        },
      };
    case 'build-error':
      return {
        ...state,
        phase: 'build-error',
        changedSinceBuild: false,
        lastError: {
          message: event.message || '',
          userFacing: !!event.userFacing,
          stack: event.stack || null,
          at: now,
        },
      };
    case 'changed':
      return { ...state, changedSinceBuild: true };
    case 'auto':
      return { ...state, auto: !!event.enabled };
    case 'watch-error':
      return {
        ...state,
        phase: 'process-error',
        lastError: {
          message: event.message || '',
          userFacing: false,
          stack: null,
          at: now,
        },
      };
    default:
      // `patch` and `asset` are information for the build details, not state.
      // An unknown event is the same thing: a newer engine may emit more, and
      // an older app must not fall over because of it.
      return state;
  }
}

// The plumbing. One instance lives for the whole run of the app; `open`
// replaces whatever was running before, and `close` leaves nothing behind.
class Builder {
  constructor({ buildJsPath, onState }) {
    this.buildJsPath = buildJsPath;
    this.onState = onState || (() => {});
    this.state = initialState();
    this.child = null;
    // Set while we are the ones ending the process, so that the `exit` that
    // follows is not reported as a crash.
    this.expectingExit = false;
    // What the person last asked for. A restart – a project switch, or the
    // serve switch – starts a fresh child whose watcher always begins with
    // auto-build on, so the wish has to be re-sent once the new one says it
    // is watching. Without this, turning auto off and then turning serve on
    // would quietly turn auto back on.
    this.desiredAuto = true;
    this.outBuf = '';
    this.errBuf = '';
  }

  getState() {
    return this.state;
  }

  // The browser choice is not something the build process knows, but it is
  // part of what the project screen shows, so it is folded in here rather
  // than sent to the renderer as a second stream.
  setBrowser(browser) {
    this.state = { ...this.state, browser };
    this.emit();
  }

  emit() {
    this.onState(this.state);
  }

  addLog(line) {
    // The log array is mutated in place and shared by every state object,
    // because copying two thousand strings on every build event would be
    // work for nothing – the renderer re-reads it whole each time anyway.
    const log = this.state.log;
    log.push(line);
    if (log.length > LOG_CAP) log.splice(0, log.length - LOG_CAP);
  }

  handleStdout(chunk) {
    const { lines, rest } = splitLines(this.outBuf, chunk);
    this.outBuf = rest;
    for (const line of lines) {
      const c = classifyLine(line);
      if (c.kind === 'event') {
        this.state = reduceState(this.state, c.event);
        if (c.event.type === 'watching' && this.desiredAuto === false) {
          this.send({ type: 'auto', enabled: false });
        }
      } else if (line.length) {
        this.addLog(line);
      }
    }
    if (lines.length) this.emit();
  }

  handleStderr(chunk) {
    const { lines, rest } = splitLines(this.errBuf, chunk);
    this.errBuf = rest;
    for (const line of lines) if (line.length) this.addLog(line);
    if (lines.length) this.emit();
  }

  // Starts a watch on `source`. Any previous child is killed first, so a
  // project switch and a serve toggle are the same operation with different
  // arguments.
  open(source, { serve = false } = {}) {
    this.stop();
    const dir = path.dirname(source);
    const args = [this.buildJsPath, source, '--watch', '--events'];
    if (serve) args.push('--serve');

    this.state = {
      ...initialState(),
      phase: 'starting',
      source,
      dir,
      name: path.basename(dir),
      serve: { enabled: serve, url: null },
      browser: this.state.browser,
      auto: this.desiredAuto,
      log: [],
    };
    this.emit();

    const child = spawn(process.execPath, args, {
      cwd: dir,
      // ELECTRON_RUN_AS_NODE turns Electron's own binary into a plain Node,
      // which is how the app avoids requiring an installed Node at all. The
      // argument list is an array and there is no shell, so a folder name
      // with a space, a quote or a semicolon in it is a file name and not a
      // command.
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.child = child;
    this.expectingExit = false;
    this.outBuf = '';
    this.errBuf = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => this.handleStdout(d));
    child.stderr.on('data', (d) => this.handleStderr(d));
    // A closed stdin pipe is normal when the child is on its way out; without
    // this the app would take the whole process down with an EPIPE.
    child.stdin.on('error', () => {});
    child.on('error', (err) => {
      if (this.child !== child) return;
      this.addLog(String(err && err.message ? err.message : err));
      this.state = { ...this.state, phase: 'process-error', lastError: {
        message: String(err && err.message ? err.message : err),
        userFacing: false, stack: null, at: Date.now(),
      } };
      this.emit();
    });
    child.on('exit', (code, signal) => {
      if (this.child !== child) return;
      this.child = null;
      if (this.expectingExit) return;
      // The child does not end on a failed build – only a kill ends it – so
      // an exit we did not ask for is a different kind of trouble from a
      // build error, and the interface says so.
      this.addLog(`build process exited (code ${code === null ? signal : code})`);
      this.state = { ...this.state, phase: 'process-error', lastError: {
        message: `The build process exited with code ${code === null ? signal : code}.`,
        userFacing: false, stack: null, at: Date.now(),
      } };
      this.emit();
    });
  }

  send(command) {
    if (!this.child || !this.child.stdin.writable) return false;
    try {
      this.child.stdin.write(JSON.stringify(command) + '\n');
      return true;
    } catch {
      return false;
    }
  }

  rebuild() {
    return this.send({ type: 'rebuild' });
  }

  setAuto(enabled) {
    this.desiredAuto = !!enabled;
    // The flag is mirrored locally as well as sent, because the checkbox
    // should answer the click rather than the round trip; the confirming
    // `auto` event then sets the same value again.
    this.state = { ...this.state, auto: !!enabled };
    this.emit();
    return this.send({ type: 'auto', enabled: !!enabled });
  }

  stop() {
    if (!this.child) return;
    this.expectingExit = true;
    // build.js installs no signal handlers, and the WebSocket server and the
    // file watcher die with the process. There is nothing to flush that is
    // not already on disk, so one kill is the whole of it – on Windows too,
    // where kill() is a hard TerminateProcess.
    try { this.child.kill(); } catch { /* already gone */ }
    this.child = null;
  }

  close() {
    this.stop();
    this.state = { ...initialState(), browser: this.state.browser };
    this.emit();
  }
}

module.exports = { Builder, splitLines, classifyLine, reduceState, initialState, LOG_CAP };
