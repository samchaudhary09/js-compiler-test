/* ============ utils.js ============ */
(function (global) {
  'use strict';

  const JSP = global.JSP || (global.JSP = {});

  const Utils = {
    /** Generate a reasonably-unique id. */
    uid(prefix = 'id') {
      return prefix + '-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
    },

    /** Debounce: returns a function that delays `fn` until after `wait` ms of inactivity. */
    debounce(fn, wait = 500) {
      let t = null;
      const debounced = function (...args) {
        if (t) clearTimeout(t);
        t = setTimeout(() => {
          t = null;
          fn.apply(this, args);
        }, wait);
      };
      debounced.cancel = () => { if (t) { clearTimeout(t); t = null; } };
      debounced.flush = (...args) => { if (t) { clearTimeout(t); t = null; fn.apply(this, args); } };
      return debounced;
    },

    /** Throttle: call at most once per `wait` ms. */
    throttle(fn, wait = 100) {
      let last = 0, timer = null, lastArgs = null;
      return function (...args) {
        const now = Date.now();
        const remaining = wait - (now - last);
        lastArgs = args;
        if (remaining <= 0) {
          if (timer) { clearTimeout(timer); timer = null; }
          last = now;
          fn.apply(this, args);
        } else if (!timer) {
          timer = setTimeout(() => {
            last = Date.now();
            timer = null;
            fn.apply(this, lastArgs);
          }, remaining);
        }
      };
    },

    /** Escape text for HTML textContent usage — we prefer textContent, but this is for safe attribute injection. */
    escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[c]));
    },

    /** True if name ends with a JS extension we support. */
    isJavaScriptFile(name) {
      return /\.(js|mjs|cjs|jsx|mjs)$/i.test(name);
    },

    /** Returns a unique name in a given set of sibling names. */
    uniqueName(base, existingNames, separator = '-') {
      const set = new Set(existingNames);
      if (!set.has(base)) return base;
      const dot = base.lastIndexOf('.');
      const stem = dot > 0 ? base.slice(0, dot) : base;
      const ext = dot > 0 ? base.slice(dot) : '';
      let i = 1;
      while (set.has(stem + separator + i + ext)) i++;
      return stem + separator + i + ext;
    },

    /** Sanitize a file/folder name (disallow path separators & control chars). */
    sanitizeName(name) {
      return String(name).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim();
    },

    /** Download a string as a file via Blob. */
    download(filename, content, mime = 'text/javascript') {
      const blob = new Blob([content], { type: mime + ';charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },

    /** Copy text to clipboard. Returns promise. */
    async copyToClipboard(text) {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
          return true;
        }
      } catch (_) { /* fall through */ }
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch (_) {
        return false;
      }
    },

    /** Format a duration in ms. */
    formatDuration(ms) {
      if (ms < 1) return '<1ms';
      if (ms < 1000) return Math.round(ms) + 'ms';
      return (ms / 1000).toFixed(2) + 's';
    },

    /** Robust value-to-string for console output. */
    formatValue(value, seen) {
      seen = seen || new WeakSet();
      const t = typeof value;
      if (value === null) return 'null';
      if (value === undefined) return 'undefined';
      if (t === 'string') return value;
      if (t === 'number' || t === 'boolean' || t === 'bigint') return String(value);
      if (t === 'symbol') return value.toString();
      if (t === 'function') {
        const name = value.name || 'anonymous';
        return '[Function: ' + name + ']';
      }
      if (value instanceof Error) {
        return value.name + ': ' + value.message;
      }
      if (value instanceof Date) return value.toISOString();
      if (value instanceof RegExp) return value.toString();
      if (seen.has(value)) return '[Circular]';
      seen.add(value);

      if (Array.isArray(value)) {
        const items = value.map((v) => this.formatValue(v, seen));
        return '[ ' + items.join(', ') + ' ]';
      }
      if (value instanceof Map) {
        const parts = [];
        value.forEach((v, k) => { parts.push(this.formatValue(k, seen) + ' => ' + this.formatValue(v, seen)); });
        return 'Map(' + value.size + ') { ' + parts.join(', ') + ' }';
      }
      if (value instanceof Set) {
        const parts = Array.from(value).map((v) => this.formatValue(v, seen));
        return 'Set(' + value.size + ') { ' + parts.join(', ') + ' }';
      }
      try {
        const keys = Object.keys(value);
        if (keys.length === 0) {
          if (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) {
            return '{}';
          }
          return Object.prototype.toString.call(value);
        }
        const parts = keys.slice(0, 50).map((k) => {
          let v;
          try { v = this.formatValue(value[k], seen); } catch (_) { v = '[unknown]'; }
          return k + ': ' + v;
        });
        let result = '{ ' + parts.join(', ');
        if (keys.length > 50) result += ', …+' + (keys.length - 50) + ' more';
        result += ' }';
        return result;
      } catch (e) {
        return String(value);
      }
    },

    /** Wait for a predicate with a timeout. */
    waitFor(predicate, timeout = 5000, interval = 50) {
      return new Promise((resolve, reject) => {
        const start = Date.now();
        (function check() {
          let result;
          try { result = predicate(); } catch (e) { return reject(e); }
          if (result) return resolve(result);
          if (Date.now() - start >= timeout) return reject(new Error('waitFor timed out'));
          setTimeout(check, interval);
        })();
      });
    },

    /** Resolve a path relative to the current page (works for GitHub Pages subpaths). */
    resolveUrl(rel) {
      try {
        return new URL(rel, window.location.href).href;
      } catch (_) {
        return rel;
      }
    },

    isMac() {
      return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
    }
  };

  JSP.Utils = Utils;
})(window);
