/* ============ execution.js ============ */
(function (global) {
  'use strict';

  const JSP = global.JSP || (global.JSP = {});
  const { State, Utils, UI } = JSP;

  const EXECUTION_TIMEOUT_MS = 5000;

  const Execution = {
    _token: 0,
    _worker: null,
    _timeoutHandle: null,
    _startTime: 0,
    _currentToken: 0,

    isRunning() {
      return State.running;
    },

    /** Get an absolute worker URL that works under GitHub Pages subpaths. */
    _getWorkerUrl() {
      const rel = './workers/javascript-worker.js';
      return Utils.resolveUrl(rel);
    },

    /** Spawn a fresh worker. */
    _spawnWorker() {
      this._terminateWorker();
      const url = this._getWorkerUrl();
      try {
        this._worker = new Worker(url, { type: 'classic' });
      } catch (e) {
        UI.appendConsole('error', 'Failed to start execution worker: ' + e.message);
        return false;
      }
      this._worker.onmessage = (e) => this._handleMessage(e);
      this._worker.onerror = (e) => {
        this._handleWorkerError(e);
      };
      this._worker.onmessageerror = () => {
        UI.appendConsole('error', 'Failed to deserialize worker message.');
      };
      return true;
    },

    _terminateWorker() {
      if (this._worker) {
        try {
          this._worker.terminate();
        } catch (_) {}
        this._worker = null;
      }
      if (this._timeoutHandle) {
        clearTimeout(this._timeoutHandle);
        this._timeoutHandle = null;
      }
    },

    _handleMessage(event) {
      const msg = event.data;
      if (!msg) return;
      if (msg.token !== this._currentToken) return; // stale message from previous run

      switch (msg.type) {
        case 'console': {
          const args = (msg.args || []).map((a) => deserialize(a));
          UI.appendConsole(msg.level, args);
          // Reset the inactivity watchdog on every console message (allows async code to continue)
          this._resetWatchdog();
          break;
        }
        case 'clear':
          UI.clearConsole();
          break;
        case 'error':
          UI.appendError(msg.error);
          break;
        case 'done':
          this._finishRun(msg.executionTime, false);
          break;
        case 'pong':
          // Worker is responsive; used to confirm alive.
          break;
      }
    },

    _handleWorkerError(e) {
      // Worker failed to load or crashed.
      if (State.running) {
        UI.appendConsole('error', 'Worker error: ' + (e.message || 'unknown error'));
        this._finishRun(0, true);
      }
      e.preventDefault && e.preventDefault();
    },

    /** Reset the inactivity timeout. Prevents killing async code that uses setTimeout/Promises. */
    _resetWatchdog() {
      if (this._timeoutHandle) clearTimeout(this._timeoutHandle);
      this._timeoutHandle = setTimeout(() => {
        if (State.running) {
          UI.appendConsole('error', [
            'Execution stopped.',
            'The program exceeded the ' + (EXECUTION_TIMEOUT_MS / 1000) + ' second execution limit.'
          ]);
          UI.appendConsole('system', 'A likely infinite loop or long-running synchronous operation was detected.');
          this.stop('timeout');
        }
      }, EXECUTION_TIMEOUT_MS);
    },

    /** Run the active file. */
    run(source) {
      if (State.running) {
        // Already running — stop first.
        this.stop('user');
        return;
      }
      if (!this._spawnWorker()) {
        return;
      }
      State.running = true;
      this._startTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      this._currentToken = ++this._token;
      UI.setRunning(true);
      UI.appendConsole('system', '▶ Running...');
      UI.scrollConsoleToBottom();

      this._worker.postMessage({
        type: 'run',
        code: source,
        token: this._currentToken
      });

      // Start the synchronous / inactivity watchdog.
      this._resetWatchdog();
    },

    /** Stop current execution. */
    stop(reason) {
      if (!State.running) return;
      this._terminateWorker();
      State.running = false;
      UI.setRunning(false);
      if (reason === 'user') {
        UI.appendConsole('warn', 'Execution stopped by user.');
      } else if (reason === 'timeout') {
        UI.appendConsole('error', 'The worker was terminated due to the execution timeout.');
      }
      const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - this._startTime;
      UI.updateExecStatus('Stopped after ' + Utils.formatDuration(elapsed));
    },

    /** Normal finish from the worker. */
    _finishRun(executionTime, aborted) {
      if (!State.running && !aborted) return;
      this._terminateWorker();
      State.running = false;
      UI.setRunning(false);
      const t = typeof executionTime === 'number' ? executionTime : 0;
      if (!aborted) {
        UI.appendConsole('success', 'Executed in ' + Utils.formatDuration(t) + ' (browser timing, not a benchmark).');
      }
      UI.updateExecStatus(aborted ? 'Aborted' : 'Done in ' + Utils.formatDuration(t));
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
      case 'boolean': return v.value === 'true';
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
