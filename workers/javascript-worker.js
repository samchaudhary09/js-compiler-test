/* ============ javascript-worker.js ============ */
/* Dedicated Web Worker that runs untrusted user JavaScript in isolation. */
(function (self) {
  'use strict';

  // Capture a reference to the host's postMessage so user code cannot
  // spoof messages by reassigning a variable in its own scope.
  const postMessageToHost = self.postMessage.bind(self);

  let currentToken = 0;

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

  function sendConsole(level, args) {
    try {
      const serialized = args.map((a) => {
        try { return serialize(a); }
        catch (_) { return { type: 'string', value: String(a) }; }
      });
      postMessageToHost({ type: 'console', level: level, args: serialized, token: currentToken });
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
    table: function () { sendConsole('log', Array.prototype.slice.call(arguments)); },
    dir: function () { sendConsole('log', Array.prototype.slice.call(arguments)); },
    group: function () { sendConsole('log', Array.prototype.slice.call(arguments)); },
    groupEnd: function () {},
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
   * Error normalization
   * ---------------------------------------------------------------- */
  function buildErrorObject(err, fallbackLine) {
    if (!err) return { name: 'Error', message: String(err), line: fallbackLine || null };
    const name = err.name || (err.constructor && err.constructor.name) || 'Error';
    const message = err.message != null ? String(err.message) : String(err);
    let line = null;
    if (typeof err.lineNumber === 'number') line = err.lineNumber;
    else if (err.stack) {
      // Stack traces inside the AsyncFunction look like:
      //   at <anonymous>:LINE:COL
      // or, on some engines, evalmachine.<anonymous>:LINE:COL
      let m = /<anonymous>:(\d+):(\d+)/.exec(err.stack);
      if (!m) m = /evalmachine\.<anonymous>:(\d+):(\d+)/.exec(err.stack);
      if (!m) {
        // Generic first match after a colon+digits.
        m = /:(\d+):(\d+)/.exec(err.stack);
      }
      if (m) line = parseInt(m[1], 10);
    }
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
  let pendingTimers = 0;
  let idleCheckHandle = null;
  let settled = false;
  let runStartTime = 0;
  let doneSent = false;
  const IDLE_GRACE_MS = 20;

  function notifyActivity() {
    // Each console message or timer scheduling resets the idle timer.
    if (idleCheckHandle) clearTimeout(idleCheckHandle);
    if (settled && pendingTimers === 0 && !doneSent) {
      idleCheckHandle = setTimeout(maybeFinish, IDLE_GRACE_MS);
    }
  }

  function wrapSetTimeout(fn, ms) {
    const extra = Array.prototype.slice.call(arguments, 2);
    pendingTimers++;
    const id = self.setTimeout(function () {
      pendingTimers = Math.max(0, pendingTimers - 1);
      try {
        fn.apply(this, arguments);
      } catch (err) {
        reportError(err);
      }
      notifyActivity();
    }, ms, ...extra);
    notifyActivity();
    return id;
  }

  function wrapSetInterval(fn, ms) {
    const extra = Array.prototype.slice.call(arguments, 2);
    // Intervals remain pending until cleared; we count them once.
    pendingTimers++;
    const id = self.setInterval(function () {
      try {
        fn.apply(this, arguments);
      } catch (err) {
        reportError(err);
      }
      notifyActivity();
    }, ms, ...extra);
    notifyActivity();
    return id;
  }

  function wrapClearTimeout(id) {
    // We don't know whether it was a timeout or interval — clear both
    // and optimistically decrement the counter once (we may briefly
    // under-count but that's safe because notifyActivity re-checks).
    self.clearTimeout(id);
    self.clearInterval(id);
    if (pendingTimers > 0) pendingTimers--;
    notifyActivity();
  }

  function wrapClearInterval(id) {
    self.clearInterval(id);
    if (pendingTimers > 0) pendingTimers--;
    notifyActivity();
  }

  function reportError(err) {
    postMessageToHost({ type: 'error', token: currentToken, error: buildErrorObject(err) });
  }

  function maybeFinish() {
    if (doneSent) return;
    if (!settled) return;
    if (pendingTimers > 0) return;
    doneSent = true;
    if (idleCheckHandle) { clearTimeout(idleCheckHandle); idleCheckHandle = null; }
    const end = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    postMessageToHost({ type: 'done', token: currentToken, executionTime: end - runStartTime });
  }

  /* ----------------------------------------------------------------
   * Execution entry point
   * ---------------------------------------------------------------- */
  function runCode(code, token) {
    currentToken = token;
    pendingTimers = 0;
    settled = false;
    doneSent = false;
    runStartTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (idleCheckHandle) { clearTimeout(idleCheckHandle); idleCheckHandle = null; }

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
        'alert', 'confirm', 'prompt',
        code
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
        noopAlert, noopConfirm, noopPrompt
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

    // In case the user's code schedules zero timers and returns a
    // non-thenable, set a safety microtask-ish check to flush shortly.
    setTimeout(() => {
      if (!settled) { settled = true; }
      notifyActivity();
    }, 0);
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
    } else if (msg.type === 'ping') {
      postMessageToHost({ type: 'pong', token: currentToken });
    }
  });
})(self);
