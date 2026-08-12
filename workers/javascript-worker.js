/* ============ javascript-worker.js ============ */
/* Dedicated Web Worker that runs untrusted user JavaScript in isolation. */
(function (self) {
  'use strict';

  // Capture a reference to the host's postMessage so user code cannot
  // spoof messages by reassigning a variable in its own scope.
  const postMessageToHost = self.postMessage.bind(self);
  const nativeSetTimeout = self.setTimeout.bind(self);
  const nativeClearTimeout = self.clearTimeout.bind(self);
  const nativeSetInterval = self.setInterval.bind(self);
  const nativeClearInterval = self.clearInterval.bind(self);

  // A same-origin worker can normally see IndexedDB and CacheStorage. The
  // playground never needs those APIs, so hide them before user code runs.
  // Lexical shadowing below provides the primary guard; non-configurable own
  // properties also block common Function-constructor escape attempts.
  [
    'indexedDB', 'webkitIndexedDB', 'mozIndexedDB', 'caches',
    'fetch', 'XMLHttpRequest', 'WebSocket', 'WebTransport', 'EventSource',
    'Worker', 'SharedWorker', 'BroadcastChannel', 'importScripts',
    'postMessage', 'close'
  ].forEach((name) => {
    try { Object.defineProperty(self, name, { value: undefined, writable: false, configurable: false }); } catch (_) {}
  });

  let currentToken = 0;
  let inputRequestId = 0;
  const pendingInputs = new Map();

  /* ----------------------------------------------------------------
   * Value serialization (structured clone doesn't carry rich types
   * across worker boundaries the way we'd like, so we do it manually).
   * ---------------------------------------------------------------- */
  function serialize(value, seen) {
    seen = seen || new Set();
    const t = typeof value;
    if (value === null) return { type: 'null', value: 'null' };
    if (value === undefined) return { type: 'undefined', value: 'undefined' };
    if (t === 'string') return { type: 'string', value: value };
    if (t === 'number') return { type: 'number', value: String(value) };
    if (t === 'boolean') return { type: 'boolean', value: String(value) };
    if (t === 'bigint') return { type: 'bigint', value: String(value) + 'n' };
    if (t === 'symbol') return { type: 'symbol', value: value.toString() };
    if (t === 'function') return { type: 'function', value: '[Function: ' + (value.name || 'anonymous') + ']' };
    if (value instanceof Error) {
      return { type: 'error', value: value.name + ': ' + value.message, name: value.name, message: value.message, stack: value.stack };
    }
    if (seen.has(value)) return { type: 'object', value: '[Circular]' };
    seen.add(value);

    if (Array.isArray(value)) {
      return { type: 'array', value: value.map((v) => serialize(v, seen)) };
    }
    if (value instanceof Map) {
      const entries = [];
      value.forEach((v, k) => entries.push([serialize(k, seen), serialize(v, seen)]));
      return { type: 'map', value: entries, size: value.size };
    }
    if (value instanceof Set) {
      return { type: 'set', value: Array.from(value).map((v) => serialize(v, seen)), size: value.size };
    }
    if (value instanceof Date) return { type: 'date', value: value.toISOString() };
    if (value instanceof RegExp) return { type: 'regexp', value: value.toString() };
    try {
      const keys = Object.keys(value);
      if (keys.length === 0 && Object.getPrototypeOf(value) === Object.prototype) {
        return { type: 'object', value: [] };
      }
      const props = keys.slice(0, 100).map((k) => [k, serialize(value[k], seen)]);
      return { type: 'object', value: props, truncated: keys.length > 100, extra: Math.max(0, keys.length - 100) };
    } catch (e) {
      return { type: 'object', value: String(value) };
    }
  }

  let consoleGroupDepth = 0;

  function sendConsole(level, args, meta) {
    try {
      const serialized = args.map((a) => {
        try { return serialize(a); }
        catch (_) { return { type: 'string', value: String(a) }; }
      });
      postMessageToHost({ type: 'console', level: level, args: serialized, table: !!(meta && meta.table), groupDepth: consoleGroupDepth, token: currentToken });
    } catch (e) {
      postMessageToHost({ type: 'console', level: 'error', args: [{ type: 'string', value: 'Failed to serialize console output: ' + e.message }], token: currentToken });
    }
    notifyActivity();
  }

  /* ----------------------------------------------------------------
   * Sandboxed console
   * ---------------------------------------------------------------- */
  const timers = Object.create(null);
  const counters = Object.create(null);

  const sandboxConsole = {
    log: function () { sendConsole('log', Array.prototype.slice.call(arguments)); },
    info: function () { sendConsole('info', Array.prototype.slice.call(arguments)); },
    warn: function () { sendConsole('warn', Array.prototype.slice.call(arguments)); },
    error: function () { sendConsole('error', Array.prototype.slice.call(arguments)); },
    debug: function () { sendConsole('debug', Array.prototype.slice.call(arguments)); },
    table: function () { sendConsole('log', Array.prototype.slice.call(arguments), { table: true }); },
    dir: function () { sendConsole('log', Array.prototype.slice.call(arguments)); },
    group: function () { sendConsole('log', Array.prototype.slice.call(arguments)); consoleGroupDepth = Math.min(20, consoleGroupDepth + 1); },
    groupCollapsed: function () { sendConsole('log', Array.prototype.slice.call(arguments)); consoleGroupDepth = Math.min(20, consoleGroupDepth + 1); },
    groupEnd: function () { consoleGroupDepth = Math.max(0, consoleGroupDepth - 1); },
    time: function (label) { timers[label || 'default'] = Date.now(); },
    timeEnd: function (label) {
      const key = label || 'default';
      const start = timers[key];
      if (start != null) {
        sendConsole('info', [key + ': ' + (Date.now() - start) + 'ms']);
        delete timers[key];
      }
    },
    count: function (label) {
      const key = label || 'default';
      counters[key] = (counters[key] || 0) + 1;
      sendConsole('info', [key + ': ' + counters[key]]);
    },
    countReset: function (label) {
      const key = label || 'default';
      delete counters[key];
    },
    clear: function () {
      consoleGroupDepth = 0;
      postMessageToHost({ type: 'clear', token: currentToken });
      notifyActivity();
    },
    assert: function (cond) {
      if (!cond) {
        const rest = Array.prototype.slice.call(arguments, 1);
        sendConsole('error', ['Assertion failed:'].concat(rest));
      }
    },
    trace: function () {
      const err = new Error();
      sendConsole('log', Array.prototype.slice.call(arguments).concat([(err.stack || '').split('\n').slice(2).join('\n')]));
    }
  };

  /* ----------------------------------------------------------------
   * IDE input bridge. A worker cannot call the native prompt without
   * freezing the host, so prompt calls are rewritten to await this promise.
   * The normal learning example `const name = prompt(...)` therefore still
   * behaves as expected inside the async runner.
   * ---------------------------------------------------------------- */
  function requestInput(message, defaultValue) {
    const requestId = ++inputRequestId;
    postMessageToHost({
      type: 'input',
      token: currentToken,
      requestId: requestId,
      message: message == null ? '' : String(message),
      defaultValue: defaultValue == null ? '' : String(defaultValue)
    });
    notifyActivity();
    return new Promise((resolve) => pendingInputs.set(requestId, resolve));
  }

  function prepareCode(code) {
    // Rewrite bare prompt calls outside strings/comments. The worker runner
    // is already async, so the familiar synchronous-looking example can
    // safely suspend while the IDE input dialog is open.
    const source = String(code || '');
    let out = '';
    let quote = null;
    let lineComment = false;
    let blockComment = false;
    for (let i = 0; i < source.length; i++) {
      const ch = source[i];
      const next = source[i + 1];
      if (lineComment) {
        out += ch;
        if (ch === '\n') lineComment = false;
        continue;
      }
      if (blockComment) {
        out += ch;
        if (ch === '*' && next === '/') { out += next; i++; blockComment = false; }
        continue;
      }
      if (quote) {
        out += ch;
        if (ch === '\\' && i + 1 < source.length) { out += source[++i]; continue; }
        if (ch === quote) quote = null;
        continue;
      }
      if ((ch === '"' || ch === "'" || ch === '`')) { quote = ch; out += ch; continue; }
      if (ch === '/' && next === '/') { out += ch + next; i++; lineComment = true; continue; }
      if (ch === '/' && next === '*') { out += ch + next; i++; blockComment = true; continue; }
      if (source.slice(i, i + 6) === 'prompt' && !/[\w$.]/.test(source[i - 1] || '') && /^prompt\s*\(/.test(source.slice(i))) {
        const match = /^prompt\s*\(/.exec(source.slice(i))[0];
        out += 'await __jspPrompt(';
        i += match.length - 1;
        continue;
      }
      out += ch;
    }
    return out;
  }

  /* ----------------------------------------------------------------
   * Error normalization
   * ---------------------------------------------------------------- */
  function buildErrorObject(err, fallbackLine) {
    if (!err) return { name: 'Error', message: String(err), line: fallbackLine || null };
    const name = err.name || (err.constructor && err.constructor.name) || 'Error';
    const message = err.message != null ? String(err.message) : String(err);
    let line = null;
    let generatedFunctionLine = false;
    if (typeof err.lineNumber === 'number') {
      line = err.lineNumber;
      generatedFunctionLine = true;
    } else if (err.stack) {
      // AsyncFunction adds two wrapper lines before the supplied source.
      // Match only generated-code frames so worker implementation lines are
      // never misreported as user-code locations (especially syntax errors).
      let match = /<anonymous>:(\d+):(\d+)/.exec(err.stack);
      if (!match) match = /evalmachine\.<anonymous>:(\d+):(\d+)/.exec(err.stack);
      if (match) {
        line = parseInt(match[1], 10);
        generatedFunctionLine = true;
      }
    }
    if (generatedFunctionLine && line > 2) line -= 2;
    return { name: name, message: message, line: line || fallbackLine || null, stack: err.stack || null };
  }

  /* ----------------------------------------------------------------
   * Pending-work tracker
   *
   * We wrap setTimeout/setInterval so we know when the user's program
   * still has asynchronous work in flight. "done" is only emitted once
   * (a) the user's top-level promise has settled AND
   * (b) no tracked timers are pending AND a short idle grace period
   *     has elapsed without new work being scheduled.
   * ---------------------------------------------------------------- */
  const pendingTimeouts = new Set();
  const pendingIntervals = new Set();
  let idleCheckHandle = null;
  let heartbeatHandle = null;
  let settled = false;
  let runStartTime = 0;
  let doneSent = false;
  const IDLE_GRACE_MS = 20;

  function pendingTimerCount() {
    return pendingTimeouts.size + pendingIntervals.size;
  }

  function notifyActivity() {
    if (idleCheckHandle) nativeClearTimeout(idleCheckHandle);
    if (settled && pendingTimerCount() === 0 && pendingInputs.size === 0 && !doneSent) {
      idleCheckHandle = nativeSetTimeout(maybeFinish, IDLE_GRACE_MS);
    }
  }

  function startHeartbeat() {
    if (heartbeatHandle) nativeClearInterval(heartbeatHandle);
    heartbeatHandle = nativeSetInterval(() => {
      if (!doneSent) postMessageToHost({ type: 'activity', token: currentToken });
    }, 1000);
  }

  function wrapSetTimeout(fn, ms) {
    const extra = Array.prototype.slice.call(arguments, 2);
    let id;
    id = nativeSetTimeout(function () {
      pendingTimeouts.delete(id);
      try {
        if (typeof fn === 'function') fn.apply(this, arguments);
        else throw new TypeError('setTimeout callback must be a function');
      } catch (err) {
        reportError(err);
      }
      notifyActivity();
    }, Number(ms) || 0, ...extra);
    pendingTimeouts.add(id);
    notifyActivity();
    return id;
  }

  function wrapSetInterval(fn, ms) {
    const extra = Array.prototype.slice.call(arguments, 2);
    let id;
    id = nativeSetInterval(function () {
      try {
        if (typeof fn === 'function') fn.apply(this, arguments);
        else throw new TypeError('setInterval callback must be a function');
      } catch (err) {
        reportError(err);
      }
      notifyActivity();
    }, Number(ms) || 0, ...extra);
    pendingIntervals.add(id);
    notifyActivity();
    return id;
  }

  function wrapClearTimeout(id) {
    nativeClearTimeout(id);
    if (pendingTimeouts.delete(id)) notifyActivity();
  }

  function wrapClearInterval(id) {
    nativeClearInterval(id);
    if (pendingIntervals.delete(id)) notifyActivity();
  }

  function reportError(err) {
    postMessageToHost({ type: 'error', token: currentToken, error: buildErrorObject(err) });
  }

  function maybeFinish() {
    if (doneSent) return;
    if (!settled) return;
    if (pendingTimerCount() > 0 || pendingInputs.size > 0) return;
    doneSent = true;
    if (idleCheckHandle) { nativeClearTimeout(idleCheckHandle); idleCheckHandle = null; }
    if (heartbeatHandle) { nativeClearInterval(heartbeatHandle); heartbeatHandle = null; }
    const end = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    postMessageToHost({ type: 'done', token: currentToken, executionTime: end - runStartTime });
  }

  /* ----------------------------------------------------------------
   * Execution entry point
   * ---------------------------------------------------------------- */
  function runCode(code, token) {
    currentToken = token;
    consoleGroupDepth = 0;
    pendingTimeouts.clear();
    pendingIntervals.clear();
    pendingInputs.clear();
    settled = false;
    doneSent = false;
    runStartTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (idleCheckHandle) { nativeClearTimeout(idleCheckHandle); idleCheckHandle = null; }
    startHeartbeat();

    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    let fn;
    try {
      // `console` and timer functions are passed in as parameters so they
      // shadow the globals inside the user's scope.
      fn = new AsyncFunction(
        'console',
        'setTimeout', 'clearTimeout',
        'setInterval', 'clearInterval',
        'atob', 'btoa', 'URL', 'URLSearchParams',
        'alert', 'confirm', 'prompt', '__jspPrompt',
        'self', 'globalThis', 'window', 'parent', 'top', 'frames', 'opener',
        'location', 'navigator', 'document',
        'localStorage', 'sessionStorage', 'indexedDB', 'caches',
        'postMessage', 'close', 'importScripts',
        prepareCode(code)
      );
    } catch (syntaxErr) {
      postMessageToHost({ type: 'error', token: token, error: buildErrorObject(syntaxErr, syntaxErr.lineNumber) });
      settled = true;
      maybeFinish();
      return;
    }

    const noopAlert = function () { sendConsole('info', ['alert() is not available inside the Web Worker.']); };
    const noopConfirm = function () { return false; };
    const noopPrompt = function () { return null; };

    let result;
    try {
      result = fn(
        sandboxConsole,
        wrapSetTimeout, wrapClearTimeout,
        wrapSetInterval, wrapClearInterval,
        self.atob ? self.atob.bind(self) : atob,
        self.btoa ? self.btoa.bind(self) : btoa,
        self.URL, self.URLSearchParams,
        noopAlert, noopConfirm, noopPrompt, requestInput,
        Object.freeze({ console: sandboxConsole }), Object.freeze({ console: sandboxConsole }),
        undefined, undefined, undefined, undefined, undefined, undefined,
        undefined, undefined, undefined, undefined, undefined, undefined,
        undefined, undefined, undefined
      );
    } catch (syncErr) {
      reportError(syncErr);
      settled = true;
      notifyActivity();
      return;
    }

    Promise.resolve(result).then(
      () => {
        settled = true;
        notifyActivity();
      },
      (err) => {
        reportError(err);
        settled = true;
        notifyActivity();
      }
    );

    // AsyncFunction always returns a Promise. Its settlement handler above is
    // the authoritative completion signal, including fetch and custom promises.
  }

  /* ----------------------------------------------------------------
   * Global error handlers (catches errors from timer callbacks etc.)
   * ---------------------------------------------------------------- */
  self.addEventListener('error', (event) => {
    if (currentToken && !doneSent) {
      const err = event.error || { name: 'Error', message: event.message || 'An error occurred' };
      postMessageToHost({
        type: 'error',
        token: currentToken,
        error: {
          name: err.name || 'Error',
          message: err.message || event.message || 'An error occurred',
          line: event.lineno || null,
          stack: err.stack || null
        }
      });
    }
  });

  self.addEventListener('unhandledrejection', (event) => {
    if (currentToken && !doneSent) {
      const reason = event.reason;
      postMessageToHost({
        type: 'error',
        token: currentToken,
        error: {
          name: (reason && reason.name) ? reason.name : 'UnhandledPromiseRejection',
          message: (reason && reason.message) ? reason.message : String(reason),
          line: null,
          stack: (reason && reason.stack) ? reason.stack : null
        }
      });
    }
  });

  self.addEventListener('message', (event) => {
    const msg = event.data;
    if (!msg) return;
    if (msg.type === 'run') {
      runCode(String(msg.code || ''), msg.token);
    } else if (msg.type === 'input-response') {
      const resolve = pendingInputs.get(msg.requestId);
      if (resolve) {
        pendingInputs.delete(msg.requestId);
        resolve(msg.value == null ? null : String(msg.value));
        notifyActivity();
      }
    } else if (msg.type === 'ping') {
      postMessageToHost({ type: 'pong', token: currentToken });
    }
  });
})(self);
