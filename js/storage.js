/* ============ storage.js ============ */
(function (global) {
  'use strict';

  const JSP = global.JSP || (global.JSP = {});
  const DB_NAME = 'js-playground-db';
  const DB_VERSION = 1;
  const STORE = 'kv';
  const SETTINGS_KEY = 'jsp.settings';

  const Storage = {
    _db: null,
    _ready: null,

    /** Open (or create) the IndexedDB database. */
    open() {
      if (this._ready) return this._ready;
      this._ready = new Promise((resolve, reject) => {
        if (!('indexedDB' in window)) {
          // Fall back to localStorage only.
          this._useLocalStorage = true;
          resolve();
          return;
        }
        let req;
        try {
          req = indexedDB.open(DB_NAME, DB_VERSION);
        } catch (e) {
          this._useLocalStorage = true;
          resolve();
          return;
        }
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE);
          }
        };
        req.onsuccess = (e) => {
          this._db = e.target.result;
          this._db.onclose = () => { this._db = null; };
          resolve();
        };
        req.onerror = () => {
          this._useLocalStorage = true;
          resolve(); // fall back to localStorage rather than crashing
        };
      });
      return this._ready;
    },

    /** Get a value by key. Returns undefined if not present. */
    async get(key) {
      await this.open();
      if (this._useLocalStorage) {
        try {
          const raw = localStorage.getItem(key);
          return raw == null ? undefined : JSON.parse(raw);
        } catch (_) { return undefined; }
      }
      return new Promise((resolve) => {
        try {
          const tx = this._db.transaction(STORE, 'readonly');
          const store = tx.objectStore(STORE);
          const req = store.get(key);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(undefined);
        } catch (e) {
          resolve(undefined);
        }
      });
    },

    /** Set a value by key. */
    async set(key, value) {
      await this.open();
      if (this._useLocalStorage) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
        return;
      }
      return new Promise((resolve) => {
        try {
          const tx = this._db.transaction(STORE, 'readwrite');
          const store = tx.objectStore(STORE);
          store.put(value, key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch (e) {
          resolve();
        }
      });
    },

    /** Delete a key. */
    async delete(key) {
      await this.open();
      if (this._useLocalStorage) {
        try { localStorage.removeItem(key); } catch (_) {}
        return;
      }
      return new Promise((resolve) => {
        try {
          const tx = this._db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).delete(key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch (e) { resolve(); }
      });
    },

    /** Clear all known app keys. */
    async clearAll() {
      await this.open();
      if (this._useLocalStorage) {
        try {
          Object.keys(localStorage)
            .filter((k) => k === SETTINGS_KEY || k === 'jsp.project' || k === 'jsp.state' || k === 'jsp.run-history' || k === 'jsp.output-messages')
            .forEach((k) => localStorage.removeItem(k));
        } catch (_) {}
        return;
      }
      return new Promise((resolve) => {
        try {
          const tx = this._db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).clear();
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch (e) { resolve(); }
      });
    },

    /* ---- Settings (also mirrored to localStorage for quick synchronous read on boot) ---- */
    loadSettingsSync() {
      try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (raw) return JSON.parse(raw);
      } catch (_) {}
      return null;
    },

    saveSettingsSync(settings) {
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (_) {}
      this.set(SETTINGS_KEY, settings);
    }
  };

  JSP.Storage = Storage;
  JSP.SETTINGS_KEY = SETTINGS_KEY;
})(window);
