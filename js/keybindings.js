/* ============ keybindings.js ============ */
(function (global) {
  'use strict';

  const JSP = global.JSP || (global.JSP = {});

  /**
   * Platform detection — works even when navigator.platform is deprecated.
   * Returns 'mac' | 'windows' | 'linux'.
   */
  function detectPlatform() {
    if (global._JSP_PLATFORM_OVERRIDE) return global._JSP_PLATFORM_OVERRIDE;
    const ua = (navigator.userAgent || '').toLowerCase();
    const platform = (navigator.platform || '').toLowerCase();
    const maxTouchPoints = navigator.maxTouchPoints || 0;
    if (/mac|iphone|ipad|ipod/.test(platform) || /mac os x/.test(ua)) return 'mac';
    if (/win/.test(platform) || /windows/.test(ua)) return 'windows';
    return 'linux';
  }

  /** Modifier key label shown in the UI (⌘ on Mac, Ctrl elsewhere). */
  function modLabel() {
    return detectPlatform() === 'mac' ? '⌘' : 'Ctrl';
  }
  function altLabel() {
    return detectPlatform() === 'mac' ? '⌥' : 'Alt';
  }
  function shiftLabel() {
    return detectPlatform() === 'mac' ? '⇧' : 'Shift';
  }

  /**
   * Canonical list of all commands the user can rebind.
   * Each entry: { id, label, category, default: { windows, mac } }
   * The chord is a normalized string like "ctrl+shift+p" using the tokens
   * ctrl, alt, shift, meta plus a key (lowercase letter, f1..f19, enter, etc.).
   */
  const BINDABLE = [
    { id: 'run',              label: 'Run JavaScript',        category: 'Execution',  defaults: { windows: 'ctrl+enter',       mac: 'meta+enter' } },
    { id: 'save',             label: 'Save File',             category: 'File',       defaults: { windows: 'ctrl+s',           mac: 'meta+s' } },
    { id: 'newFile',          label: 'New File',              category: 'File',       defaults: { windows: 'ctrl+n',           mac: 'meta+n' } },
    { id: 'closeFile',        label: 'Close File',            category: 'File',       defaults: { windows: 'ctrl+w',           mac: 'meta+w' } },
    { id: 'commandPalette',   label: 'Command Palette',       category: 'View',       defaults: { windows: 'ctrl+shift+p',     mac: 'meta+shift+p' } },
    { id: 'quickOpen',        label: 'Quick Open',            category: 'View',       defaults: { windows: 'ctrl+p',           mac: 'meta+p' } },
    { id: 'toggleSidebar',    label: 'Toggle Sidebar',        category: 'View',       defaults: { windows: 'ctrl+b',           mac: 'meta+b' } },
    { id: 'togglePanel',      label: 'Toggle Console Panel',  category: 'View',       defaults: { windows: 'ctrl+j',           mac: 'meta+j' } },
    { id: 'toggleMinimap',    label: 'Toggle Minimap',        category: 'View',       defaults: { windows: '',                 mac: '' } },
    { id: 'toggleWordWrap',   label: 'Toggle Word Wrap',      category: 'View',       defaults: { windows: 'alt+z',            mac: 'alt+z' } },
    { id: 'toggleTheme',      label: 'Toggle Theme',          category: 'View',       defaults: { windows: 'ctrl+k ctrl+t',    mac: 'meta+k meta+t' } },
    { id: 'clearConsole',     label: 'Clear Console',         category: 'Console',    defaults: { windows: 'ctrl+l',           mac: 'meta+l' } },
    { id: 'formatDocument',   label: 'Format Document',       category: 'Editor',     defaults: { windows: 'shift+alt+f',      mac: 'shift+alt+f' } },
    { id: 'settings',         label: 'Open Settings',         category: 'Settings',   defaults: { windows: 'ctrl+,',           mac: 'meta+,' } },
    { id: 'find',             label: 'Find',                  category: 'Editor',     defaults: { windows: 'ctrl+f',           mac: 'meta+f' } },
    { id: 'replace',          label: 'Replace',               category: 'Editor',     defaults: { windows: 'ctrl+h',           mac: 'meta+h' } }
  ];

  /** Maps action id -> default chord for the current platform. */
  function defaultChord(actionId) {
    const entry = BINDABLE.find((b) => b.id === actionId);
    if (!entry) return null;
    const p = detectPlatform() === 'mac' ? 'mac' : 'windows';
    return normalize(entry.defaults[p] || '');
  }

  /** Returns the user's bound chord, falling back to the default. */
  function chordFor(actionId) {
    const user = JSP.State && JSP.State.settings && JSP.State.settings.keybindings;
    if (user && Object.prototype.hasOwnProperty.call(user, actionId)) {
      return normalize(user[actionId] || '');
    }
    return defaultChord(actionId);
  }

  /** Map of chord -> actionId (resolved, with user overrides applied). */
  function buildChordMap() {
    const map = new Map();
    // Defaults first.
    BINDABLE.forEach((b) => {
      const chord = defaultChord(b.id);
      if (chord) map.set(chord, b.id);
    });
    // User overrides — possibly removing default.
    const user = (JSP.State && JSP.State.settings && JSP.State.settings.keybindings) || {};
    Object.keys(user).forEach((actionId) => {
      // Remove any existing binding that points at this action.
      for (const [chord, id] of Array.from(map.entries())) {
        if (id === actionId) map.delete(chord);
      }
      const chord = normalize(user[actionId]);
      if (chord) map.set(chord, actionId);
    });
    return map;
  }

  /** Normalize a chord string to a canonical lowercase form. */
  function normalize(chord) {
    if (!chord) return '';
    const parts = String(chord).toLowerCase().split(/\s*\+\s*/).map((p) => p.trim()).filter(Boolean);
    const mods = { ctrl: false, alt: false, shift: false, meta: false };
    const keys = [];
    for (let p of parts) {
      if (p === 'control' || p === 'ctrl' || p === 'ctl' || p === 'cmd' || p === 'command' || p === 'win' || p === 'windows' || p === 'meta' || p === '⌘') {
        // ctrl and meta are treated as the logical "mod" — on mac maps to meta, elsewhere ctrl.
        // We preserve them separately so a user can bind ctrl+x on mac explicitly.
        if (p === 'cmd' || p === 'command' || p === 'win' || p === 'windows' || p === 'meta' || p === '⌘') mods.meta = true;
        else mods.ctrl = true;
      } else if (p === 'alt' || p === 'option' || p === '⌥') {
        mods.alt = true;
      } else if (p === 'shift' || p === '⇧') {
        mods.shift = true;
      } else if (p === 'space') {
        keys.push(' ');
      } else if (p === 'esc' || p === 'escape') {
        keys.push('escape');
      } else if (p === 'enter' || p === 'return') {
        keys.push('enter');
      } else if (p === 'tab') {
        keys.push('tab');
      } else if (p === 'backspace' || p === 'delete') {
        keys.push(p === 'delete' && !parts.includes('backspace') ? 'delete' : 'backspace');
      } else if (/^f\d{1,2}$/.test(p)) {
        keys.push(p);
      } else if (p.length === 1) {
        keys.push(p);
      } else {
        keys.push(p);
      }
    }
    const out = [];
    if (mods.ctrl) out.push('ctrl');
    if (mods.alt) out.push('alt');
    if (mods.shift) out.push('shift');
    if (mods.meta) out.push('meta');
    out.push(...keys);
    return out.join('+');
  }

  /** Convert a KeyboardEvent to a normalized chord. */
  function fromEvent(e) {
    const out = [];
    if (e.ctrlKey) out.push('ctrl');
    if (e.altKey) out.push('alt');
    if (e.shiftKey) out.push('shift');
    if (e.metaKey) out.push('meta');
    let key = (e.key || '').toLowerCase();
    if (key === ' ') key = 'space';
    if (key === 'escape') key = 'escape';
    // Ignore pure modifier presses.
    if (['control', 'alt', 'shift', 'meta'].includes(key)) return out.join('+');
    out.push(key);
    return out.join('+');
  }

  /** Convert a normalized chord to a human-friendly label for the current platform. */
  function pretty(chord) {
    if (!chord) return '';
    const p = detectPlatform();
    return chord.split('+').map((part) => {
      if (part === 'ctrl' || part === 'meta') return p === 'mac' ? '⌘' : 'Ctrl';
      if (part === 'alt') return p === 'mac' ? '⌥' : 'Alt';
      if (part === 'shift') return p === 'mac' ? '⇧' : 'Shift';
      if (part === 'enter') return 'Enter';
      if (part === 'escape') return 'Esc';
      if (part === 'space') return 'Space';
      if (part === 'backspace') return 'Backspace';
      if (part === 'delete') return 'Del';
      if (part.length === 1) return part.toUpperCase();
      if (/^f\d{1,2}$/.test(part)) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    }).join(p === 'mac' ? '' : '+');
  }

  /**
   * Check whether a chord is a "mod only" press (no non-modifier key).
   * We ignore these for matching so that combos such as just Ctrl don't fire.
   */
  function isModifierOnly(chord) {
    if (!chord) return true;
    return chord.split('+').every((p) => p === 'ctrl' || p === 'alt' || p === 'shift' || p === 'meta');
  }

  /**
   * Chord sequences (e.g. "ctrl+k ctrl+t") — we track the last key time
   * and the partial chord. This is intentionally simple: if a single-chord
   * match exists, it fires immediately. Otherwise we wait up to 800ms for
   * the second part.
   */
  let partial = null;
  let partialTimer = null;
  function clearPartial() {
    partial = null;
    if (partialTimer) { clearTimeout(partialTimer); partialTimer = null; }
  }

  /**
   * Look up an action given a current keyboard event.
   * Returns the actionId to run, or null.
   */
  function matchEvent(e) {
    const map = buildChordMap();
    const chord = fromEvent(e);
    if (isModifierOnly(chord)) return null;

    // Build all keys including multi-chord (sequences separated by spaces).
    // For multi-chords, flatten the map: a sequence entry is stored as
    // "ctrl+k > ctrl+t" (we normalize to use '>' as separator).
    // We support it by tracking partial.
    if (partial) {
      const candidate = partial + '>' + chord;
      for (const [stored, actionId] of map.entries()) {
        if (stored === candidate) {
          clearPartial();
          return actionId;
        }
      }
    }
    // Single-chord exact match first.
    if (map.has(chord)) {
      clearPartial();
      return map.get(chord);
    }
    // Prefix of a multi-chord?
    let isPrefix = false;
    for (const stored of map.keys()) {
      if (stored.startsWith(chord + '>')) { isPrefix = true; break; }
    }
    if (isPrefix) {
      partial = chord;
      if (partialTimer) clearTimeout(partialTimer);
      partialTimer = setTimeout(clearPartial, 900);
      return null;
    }
    clearPartial();
    return null;
  }

  /** Check if a given chord conflicts with any other binding (excluding `exceptAction`). */
  function findConflicts(chord, exceptAction) {
    const normalized = normalize(chord);
    if (!normalized) return [];
    const conflicts = [];
    const map = buildChordMap();
    for (const [stored, actionId] of map.entries()) {
      if (actionId === exceptAction) continue;
      if (stored === normalized) {
        const def = BINDABLE.find((b) => b.id === actionId);
        conflicts.push(def ? def.label : actionId);
      }
    }
    return conflicts;
  }

  /** Persist user binding. */
  function setBinding(actionId, chord) {
    const settings = JSP.State.settings;
    settings.keybindings = settings.keybindings || {};
    const normalized = normalize(chord);
    if (!normalized) {
      delete settings.keybindings[actionId];
    } else {
      // If this chord is already bound to another action, clear that one.
      for (const [otherId, otherChord] of Object.entries(settings.keybindings)) {
        if (otherId !== actionId && normalize(otherChord) === normalized) {
          delete settings.keybindings[otherId];
        }
      }
      settings.keybindings[actionId] = normalized;
    }
    JSP.Commands.persistSettings();
    JSP.Editor.refreshActions && JSP.Editor.refreshActions();
  }

  function resetBinding(actionId) {
    const settings = JSP.State.settings;
    if (settings.keybindings && settings.keybindings[actionId] !== undefined) {
      delete settings.keybindings[actionId];
      JSP.Commands.persistSettings();
      JSP.Editor.refreshActions && JSP.Editor.refreshActions();
    }
  }

  function resetAll() {
    JSP.State.settings.keybindings = {};
    JSP.Commands.persistSettings();
    JSP.Editor.refreshActions && JSP.Editor.refreshActions();
  }

  const KeyBindings = {
    BINDABLE: BINDABLE,
    detectPlatform: detectPlatform,
    modLabel: modLabel,
    altLabel: altLabel,
    shiftLabel: shiftLabel,
    defaultChord: defaultChord,
    chordFor: chordFor,
    pretty: pretty,
    normalize: normalize,
    fromEvent: fromEvent,
    matchEvent: matchEvent,
    findConflicts: findConflicts,
    setBinding: setBinding,
    resetBinding: resetBinding,
    resetAll: resetAll,
    buildChordMap: buildChordMap
  };

  JSP.KeyBindings = KeyBindings;
})(window);
