/* ============ execution.js ============ */
(function (global) {
  'use strict';

  const JSP = global.JSP || (global.JSP = {});
  const { State, Utils } = JSP;

  const EXECUTION_TIMEOUT_MS = 5000;

  /** Resolve UI at call time — this file loads before ui.js. */
  function ui() {
    return JSP.UI || null;
  }

  /**
   * Compact in-process worker source used when the on-disk worker cannot be
   * loaded (wrong path, file://, CDN/hosting quirks). Mirrors the public
   * console / timer surface of workers/javascript-worker.js.
   */
  const INLINE_WORKER_SOURCE = [
    '(function (self) {',
    "  'use strict';",
    '  var postMessageToHost = self.postMessage.bind(self);',
    '  var currentToken = 0;',
    '  function serialize(value, seen) {',
    '    seen = seen || [];',
    '    var t = typeof value;',
    "    if (value === null) return { type: 'null', value: 'null' };",
    "    if (value === undefined) return { type: 'undefined', value: 'undefined' };",
    "    if (t === 'string') return { type: 'string', value: value };",
    "    if (t === 'number') return { type: 'number', value: String(value) };",
    "    if (t === 'boolean') return { type: 'boolean', value: String(value) };",
    "    if (t === 'bigint') return { type: 'bigint', value: String(value) + 'n' };",
    "    if (t === 'symbol') return { type: 'symbol', value: String(value) };",
    "    if (t === 'function') return { type: 'function', value: '[Function: ' + (value.name || 'anonymous') + ']' };",
    '    if (value instanceof Error) {',
    "      return { type: 'error', name: value.name, message: value.message, stack: value.stack, value: value.name + ': ' + value.message };",
    '    }',
    '    for (var i = 0; i < seen.length; i++) if (seen[i] === value) return { type: "object", value: "[Circular]" };',
    '    seen.push(value);',
    '    if (Array.isArray(value)) return { type: "array", value: value.map(function (v) { return serialize(v, seen); }) };',
    '    if (value instanceof Date) return { type: "date", value: value.toISOString() };',
    '    if (value instanceof RegExp) return { type: "regexp", value: value.toString() };',
    '    try {',
    '      var keys = Object.keys(value);',
    '      var props = keys.slice(0, 100).map(function (k) { return [k, serialize(value[k], seen)]; });',
    '      return { type: "object", value: props, truncated: keys.length > 100, extra: Math.max(0, keys.length - 100) };',
    '    } catch (err) {',
    '      return { type: "object", value: String(value) };',
    '    }',
    '  }',
    '  function sendConsole(level, args) {',
    '    var serialized = [];',
    '    for (var i = 0; i < args.length; i++) {',
    '      try { serialized.push(serialize(args[i])); }',
    '      catch (e) { serialized.push({ type: "string", value: String(args[i]) }); }',
    '    }',
    '    postMessageToHost({ type: "console", level: level, args: serialized, token: currentToken });',
    '    notifyActivity();',
    '  }',
    '  var timers = Object.create(null);',
    '  var counters = Object.create(null);',
    '  var sandboxConsole = {',
    '    log: function () { sendConsole("log", Array.prototype.slice.call(arguments)); },',
    '    info: function () { sendConsole("info", Array.prototype.slice.call(arguments)); },',
    '    warn: function () { sendConsole("warn", Array.prototype.slice.call(arguments)); },',
    '    error: function () { sendConsole("error", Array.prototype.slice.call(arguments)); },',
    '    debug: function () { sendConsole("debug", Array.prototype.slice.call(arguments)); },',
    '    table: function () { sendConsole("log", Array.prototype.slice.call(arguments)); },',
    '    dir: function () { sendConsole("log", Array.prototype.slice.call(arguments)); },',
    '    group: function () { sendConsole("log", Array.prototype.slice.call(arguments)); },',
    '    groupEnd: function () {},',
    '    time: function (label) { timers[label || "default"] = Date.now(); },',
    '    timeEnd: function (label) {',
    '      var key = label || "default";',
    '      if (timers[key] != null) { sendConsole("info", [key + ": " + (Date.now() - timers[key]) + "ms"]); delete timers[key]; }',
    '    },',
    '    count: function (label) {',
    '      var key = label || "default";',
    '      counters[key] = (counters[key] || 0) + 1;',
    '      sendConsole("info", [key + ": " + counters[key]]);',
    '    },',
    '    countReset: function (label) { delete counters[label || "default"]; },',
    '    clear: function () { postMessageToHost({ type: "clear", token: currentToken }); notifyActivity(); },',
    '    assert: function (cond) {',
    '      if (!cond) sendConsole("error", ["Assertion failed:"].concat(Array.prototype.slice.call(arguments, 1)));',
    '    },',
    '    trace: function () { sendConsole("log", Array.prototype.slice.call(arguments)); }',
    '  };',
    '  var pendingTimers = 0, idleCheckHandle = null, settled = false, runStartTime = 0, doneSent = false;',
    '  var IDLE_GRACE_MS = 20;',
    '  function notifyActivity() {',
    '    if (idleCheckHandle) clearTimeout(idleCheckHandle);',
    '    if (settled && pendingTimers === 0 && !doneSent) idleCheckHandle = setTimeout(maybeFinish, IDLE_GRACE_MS);',
    '  }',
    '  function wrapSetTimeout(fn, ms) {',
    '    var extra = Array.prototype.slice.call(arguments, 2);',
    '    pendingTimers++;',
    '    var id = self.setTimeout(function () {',
    '      pendingTimers = Math.max(0, pendingTimers - 1);',
    '      try { fn.apply(this, arguments); } catch (err) { reportError(err); }',
    '      notifyActivity();',
    '    }, ms);',
    '    notifyActivity();',
    '    return id;',
    '  }',
    '  function wrapSetInterval(fn, ms) {',
    '    pendingTimers++;',
    '    var id = self.setInterval(function () {',
    '      try { fn.apply(this, arguments); } catch (err) { reportError(err); }',
    '      notifyActivity();',
    '    }, ms);',
    '    notifyActivity();',
    '    return id;',
    '  }',
    '  function wrapClearTimeout(id) { self.clearTimeout(id); self.clearInterval(id); if (pendingTimers > 0) pendingTimers--; notifyActivity(); }',
    '  function wrapClearInterval(id) { self.clearInterval(id); if (pendingTimers > 0) pendingTimers--; notifyActivity(); }',
    '  function reportError(err) {',
    '    postMessageToHost({ type: "error", token: currentToken, error: {',
    '      name: (err && err.name) || "Error",',
    '      message: err && err.message != null ? String(err.message) : String(err),',
    '      stack: err && err.stack || null',
    '    }});',
    '  }',
    '  function maybeFinish() {',
    '    if (doneSent || !settled || pendingTimers > 0) return;',
    '    doneSent = true;',
    '    if (idleCheckHandle) { clearTimeout(idleCheckHandle); idleCheckHandle = null; }',
    '    var end = (typeof performance !== "undefined" ? performance.now() : Date.now());',
    '    postMessageToHost({ type: "done", token: currentToken, executionTime: end - runStartTime });',
    '  }',
    '  function runCode(code, token) {',
    '    currentToken = token; pendingTimers = 0; settled = false; doneSent = false;',
    '    runStartTime = (typeof performance !== "undefined" ? performance.now() : Date.now());',
    '    if (idleCheckHandle) { clearTimeout(idleCheckHandle); idleCheckHandle = null; }',
    '    var AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;',
    '    var fn;',
    '    try {',
    '      fn = new AsyncFunction("console","setTimeout","clearTimeout","setInterval","clearInterval","atob","btoa","URL","URLSearchParams","alert","confirm","prompt", code);',
    '    } catch (syntaxErr) {',
    '      reportError(syntaxErr); settled = true; maybeFinish(); return;',
    '    }',
    '    var noopAlert = function () { sendConsole("info", ["alert() is not available inside the sandbox."]); };',
    '    try {',
    '      var result = fn(sandboxConsole, wrapSetTimeout, wrapClearTimeout, wrapSetInterval, wrapClearInterval,',
    '        self.atob && self.atob.bind(self), self.btoa && self.btoa.bind(self),',
    '        self.URL, self.URLSearchParams, noopAlert, function () { return false; }, function () { return null; });',
    '      Promise.resolve(result).then(function () { settled = true; notifyActivity(); }, function (err) { reportError(err); settled = true; notifyActivity(); });',
    '    } catch (syncErr) {',
    '      reportError(syncErr); settled = true; notifyActivity();',
    '    }',
    '    setTimeout(function () { if (!settled) settled = true; notifyActivity(); }, 0);',
    '  }',
    '  self.addEventListener("message", function (event) {',
    '    var msg = event.data; if (!msg) return;',
    '    if (msg.type === "run") runCode(String(msg.code || ""), msg.token);',
    '    else if (msg.type === "ping") postMessageToHost({ type: "pong", token: currentToken });',
    '  });',
    '})(self);'
  ].join('\n');

  const Execution = {
    _token: 0,
    _worker: null,
    _timeoutHandle: null,
    _startTime: 0,
    _currentToken: 0,
    _blobUrl: null,
    _iframe: null,
    _iframeListener: null,
    _usingIframe: false,

    isRunning() {
      return !!State.running;
    },

    /** Get an absolute worker URL that works under GitHub Pages subpaths. */
    _getWorkerUrl() {
      const rel = './workers/javascript-worker.js';
      return (Utils && Utils.resolveUrl) ? Utils.resolveUrl(rel) : rel;
    },

    _revokeBlob() {
      if (this._blobUrl) {
        try { URL.revokeObjectURL(this._blobUrl); } catch (_) {}
        this._blobUrl = null;
      }
    },

    _bindWorker(worker) {
      this._worker = worker;
      this._gotMessage = false;
      this._worker.onmessage = (e) => this._handleMessage(e);
      this._worker.onerror = (e) => this._handleWorkerError(e);
      this._worker.onmessageerror = () => {
        const u = ui();
        if (u) u.appendConsole('error', 'Failed to deserialize worker message.');
      };
    },

    _createBlobWorker(source) {
      this._revokeBlob();
      const blob = new Blob([source], { type: 'text/javascript' });
      this._blobUrl = URL.createObjectURL(blob);
      return new Worker(this._blobUrl);
    },

    /**
     * Spawn a worker. Prefers the dedicated file, then an inline blob worker.
     * Returns true if a worker (or iframe fallback) is ready.
     */
    _spawnWorker() {
      this._terminateWorker();
      if (typeof Worker === 'undefined') {
        return this._spawnIframeFallback();
      }

      // 1) Dedicated worker file (best: matches workers/javascript-worker.js).
      try {
        this._bindWorker(new Worker(this._getWorkerUrl(), { type: 'classic' }));
        return true;
      } catch (e) {
        // Fall through to blob worker.
      }

      // 2) Inline blob worker — never depends on a network/path lookup.
      try {
        this._bindWorker(this._createBlobWorker(INLINE_WORKER_SOURCE));
        return true;
      } catch (e2) {
        // 3) Hidden sandboxed iframe as a last resort (no Worker API / CSP).
        return this._spawnIframeFallback();
      }
    },

    _spawnIframeFallback() {
      try {
        this._cleanupIframe();
        const iframe = document.createElement('iframe');
        iframe.setAttribute('sandbox', 'allow-scripts');
        iframe.setAttribute('aria-hidden', 'true');
        iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden;pointer-events:none;';
        // Bridge: iframe talks to parent via postMessage. The runner is the
        // same source, rewritten so postMessage goes to the parent window.
        const bridged = INLINE_WORKER_SOURCE
          .replace(
            'var postMessageToHost = self.postMessage.bind(self);',
            'var postMessageToHost = function (msg) { parent.postMessage(msg, "*"); };'
          )
          .replace(
            'self.addEventListener("message", function (event) {',
            'window.addEventListener("message", function (event) {'
          );
        iframe.srcdoc = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script>' +
          bridged.replace(/<\/script/gi, '<\\/script') +
          '<\/script></body></html>';
        document.body.appendChild(iframe);
        this._iframe = iframe;
        this._usingIframe = true;
        this._iframeListener = (event) => {
          if (!this._iframe || event.source !== this._iframe.contentWindow) return;
          this._handleMessage({ data: event.data });
        };
        window.addEventListener('message', this._iframeListener);
        this._worker = {
          postMessage: (msg) => {
            const send = () => {
              try { iframe.contentWindow && iframe.contentWindow.postMessage(msg, '*'); } catch (_) {}
            };
            // srcdoc may not be ready on the first tick.
            if (iframe.contentWindow) send();
            else iframe.addEventListener('load', send, { once: true });
          },
          terminate: () => this._cleanupIframe()
        };
        return true;
      } catch (e) {
        const u = ui();
        if (u) u.appendConsole('error', 'Failed to start execution sandbox: ' + (e && e.message ? e.message : e));
        return false;
      }
    },

    _cleanupIframe() {
      if (this._iframeListener) {
        try { window.removeEventListener('message', this._iframeListener); } catch (_) {}
        this._iframeListener = null;
      }
      if (this._iframe) {
        try { this._iframe.remove(); } catch (_) {}
        this._iframe = null;
      }
      this._usingIframe = false;
    },

    _terminateWorker() {
      if (this._worker) {
        try { this._worker.terminate(); } catch (_) {}
        this._worker = null;
      }
      this._cleanupIframe();
      this._revokeBlob();
      if (this._timeoutHandle) {
        clearTimeout(this._timeoutHandle);
        this._timeoutHandle = null;
      }
    },

    _handleMessage(event) {
      const msg = event.data;
      if (!msg) return;
      this._gotMessage = true;
      if (msg.token !== this._currentToken) return; // stale message from previous run
      const u = ui();
      if (!u) return;

      switch (msg.type) {
        case 'console': {
          const args = (msg.args || []).map((a) => deserialize(a));
          u.appendConsole(msg.level, args);
          this._resetWatchdog();
          break;
        }
        case 'clear':
          u.clearConsole();
          break;
        case 'error':
          u.appendError(msg.error);
          break;
        case 'done':
          this._finishRun(msg.executionTime, false);
          break;
        case 'pong':
          break;
      }
    },

    _handleWorkerError(e) {
      // If the dedicated file worker failed to load (no messages yet), swap in the inline blob.
      if (State.running && this._worker && !this._gotMessage && !this._blobUrl && !this._usingIframe) {
        try {
          try { this._worker.terminate(); } catch (_) {}
          this._bindWorker(this._createBlobWorker(INLINE_WORKER_SOURCE));
          this._worker.postMessage({
            type: 'run',
            code: this._lastCode || '',
            token: this._currentToken
          });
          if (e && e.preventDefault) e.preventDefault();
          return;
        } catch (_) {
          // fall through to error reporting
        }
      }
      if (State.running) {
        const u = ui();
        if (u) u.appendConsole('error', 'Worker error: ' + ((e && e.message) || 'unknown error'));
        this._finishRun(0, true);
      }
      if (e && e.preventDefault) e.preventDefault();
    },

    /** Reset the inactivity timeout. Prevents killing async code that uses setTimeout/Promises. */
    _resetWatchdog() {
      if (this._timeoutHandle) clearTimeout(this._timeoutHandle);
      this._timeoutHandle = setTimeout(() => {
        if (State.running) {
          const u = ui();
          if (u) {
            u.appendConsole('error', [
              'Execution stopped.',
              'The program exceeded the ' + (EXECUTION_TIMEOUT_MS / 1000) + ' second execution limit.'
            ]);
            u.appendConsole('system', 'A likely infinite loop or long-running synchronous operation was detected.');
          }
          this.stop('timeout');
        }
      }, EXECUTION_TIMEOUT_MS);
    },

    /** Run the active file. Always surfaces an error instead of failing silently. */
    run(source) {
      if (State.running) {
        this.stop('user');
        return;
      }

      const code = source == null ? '' : String(source);
      this._lastCode = code;

      if (!this._spawnWorker()) {
        return;
      }

      State.running = true;
      this._startTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      this._currentToken = ++this._token;

      try {
        const u = ui();
        if (u) {
          u.setRunning(true);
          u.appendConsole('system', '▶ Running...');
          if (u.switchConsoleTab) u.switchConsoleTab('output');
          if (u.scrollConsoleToBottom) u.scrollConsoleToBottom();
        }

        // Iframe srcdoc needs a tick to boot before it can receive the run message.
        const post = () => {
          if (!this._worker) return;
          this._worker.postMessage({
            type: 'run',
            code: code,
            token: this._currentToken
          });
        };
        if (this._usingIframe) {
          setTimeout(post, 30);
        } else {
          post();
        }

        this._resetWatchdog();
      } catch (err) {
        this._terminateWorker();
        State.running = false;
        const u = ui();
        if (u) {
          u.setRunning(false);
          u.appendConsole('error', 'Failed to run code: ' + (err && err.message ? err.message : err));
        }
      }
    },

    /** Stop current execution. */
    stop(reason) {
      if (!State.running) return;
      this._terminateWorker();
      State.running = false;
      const u = ui();
      if (u) {
        u.setRunning(false);
        if (reason === 'user') {
          u.appendConsole('warn', 'Execution stopped by user.');
        } else if (reason === 'timeout') {
          u.appendConsole('error', 'The worker was terminated due to the execution timeout.');
        }
        const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - this._startTime;
        if (u.updateExecStatus) {
          u.updateExecStatus('Stopped after ' + (Utils && Utils.formatDuration ? Utils.formatDuration(elapsed) : Math.round(elapsed) + 'ms'));
        }
      }
    },

    /** Normal finish from the worker. */
    _finishRun(executionTime, aborted) {
      if (!State.running && !aborted) return;
      this._terminateWorker();
      State.running = false;
      const u = ui();
      if (!u) return;
      u.setRunning(false);
      const t = typeof executionTime === 'number' ? executionTime : 0;
      const dur = (Utils && Utils.formatDuration) ? Utils.formatDuration(t) : Math.round(t) + 'ms';
      if (!aborted) {
        u.appendConsole('success', 'Executed in ' + dur + ' (browser timing, not a benchmark).');
      }
      if (u.updateExecStatus) u.updateExecStatus(aborted ? 'Aborted' : 'Done in ' + dur);
    }
  };

  /** Convert serialized values from the worker back into display strings. */
  function deserialize(v) {
    if (v == null) return v;
    switch (v.type) {
      case 'null': return null;
      case 'undefined': return undefined;
      case 'string': return v.value;
      case 'number': {
          const n = Number(v.value);
          return Number.isNaN(n) ? v.value : n;
        }
      case 'boolean': return v.value === true || v.value === 'true';
      case 'bigint': return { __bigint: v.value };
      case 'symbol': return { __text: v.value };
      case 'function': return { __text: v.value };
      case 'date': return new Date(v.value);
      case 'regexp': return { __text: v.value };
      case 'error': {
          const e = new Error(v.message);
          e.name = v.name;
          e.stack = v.stack;
          return e;
        }
      case 'array':
        return (v.value || []).map(deserialize);
      case 'set': {
          const s = new Set((v.value || []).map(deserialize));
          return s;
        }
      case 'map': {
          const m = new Map((v.value || []).map((pair) => [deserialize(pair[0]), deserialize(pair[1])]));
          return m;
        }
      case 'object': {
          if (Array.isArray(v.value)) {
            const o = {};
            for (const [k, val] of v.value) {
              o[k] = deserialize(val);
            }
            if (v.truncated) o['…'] = '+' + v.extra + ' more properties';
            return o;
          }
          return { __text: v.value };
        }
      default:
        return String(v.value != null ? v.value : v);
    }
  }

  JSP.Execution = Execution;
})(window);
