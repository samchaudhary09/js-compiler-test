/* ============ editor.js ============ */
(function (global) {
  'use strict';

  const JSP = global.JSP || (global.JSP = {});
  const { State, Utils, UI, Filesystem } = JSP;

  let monacoLoadPromise = null;

  /** Configure and load Monaco from the versioned CDN. */
  function loadMonaco() {
    if (monacoLoadPromise) return monacoLoadPromise;
    monacoLoadPromise = new Promise((resolve, reject) => {
      if (typeof require === 'undefined') {
        reject(new Error('Monaco loader not available'));
        return;
      }
      const version = '0.45.0';
      const baseUrl = 'https://cdn.jsdelivr.net/npm/monaco-editor@' + version + '/min/vs';

      // Configure loader.
      require.config({ paths: { vs: baseUrl } });

      // Some environments (e.g. GitHub Pages) may need this cross-origin setting.
      try {
        global.require = require;
      } catch (_) {}

      require(['vs/editor/editor.main'], function () {
        resolve(global.monaco);
      }, function (err) {
        reject(err);
      });

      // Safety timeout.
      setTimeout(() => reject(new Error('Monaco load timed out')), 30000);
    });
    return monacoLoadPromise;
  }

  let _actionDisposables = [];

  const EditorModule = {
    monaco: null,
    container: null,
    editor: null,
    _disposedActions: false,

    /** Initialize Monaco once and create the editor. */
    async init(container) {
      this.container = container;
      try {
        this.monaco = await loadMonaco();
      } catch (e) {
        const msg = (e && e.message) ? e.message : String(e);
        this._installFallbackEditor(container, msg);
        return this.editor;
      }

      const monaco = this.monaco;

      // Define custom themes.
      monaco.editor.defineTheme('jsp-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [],
        colors: {
          'editor.background': '#111820',
          'editor.foreground': '#d6dee6',
          'editorLineNumber.foreground': '#858585',
          'editorLineNumber.activeForeground': '#c6c6c6',
          'editorCursor.foreground': '#aeafad',
          'editor.selectionBackground': '#264f78',
          'editor.inactiveSelectionBackground': '#3a3d41',
          'editor.lineHighlightBackground': '#2a2d2e',
          'editorIndentGuide.background1': '#404040',
          'editorIndentGuide.activeBackground1': '#707070',
          'editorWidget.background': '#252526',
          'editorWidget.border': '#454545',
          'editorSuggestWidget.background': '#252526',
          'editorSuggestWidget.border': '#454545',
          'editorSuggestWidget.selectedBackground': '#04395e',
          'editorHoverWidget.background': '#252526',
          'editorHoverWidget.border': '#454545',
          'peekView.border': '#007acc',
          'peekViewEditor.background': '#111820',
          'peekViewResult.background': '#252526'
        }
      });

      monaco.editor.defineTheme('jsp-light', {
        base: 'vs',
        inherit: true,
        rules: [],
        colors: {
          'editor.background': '#f5f8fa',
          'editor.foreground': '#2b3a46',
          'editorLineNumber.foreground': '#999999',
          'editorLineNumber.activeForeground': '#333333',
          'editorCursor.foreground': '#000000',
          'editor.selectionBackground': '#add6ff',
          'editor.inactiveSelectionBackground': '#d9d9d9',
          'editor.lineHighlightBackground': '#eaf1f5',
          'editorIndentGuide.background1': '#d6e1e8',
          'editorIndentGuide.activeBackground1': '#9ab6c7',
          'editorWidget.background': '#ffffff',
          'editorWidget.border': '#c8d4de'
        }
      });

      // JavaScript defaults — enable rich language features.
      monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: false,
        noSyntaxValidation: false,
        diagnosticCodesToIgnore: [
          // Common browser-style "not defined" noise when users use console/setTimeout/etc.
          // We keep most diagnostics; only suppress a few that are misleading in playground context.
        ]
      });

      monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
        target: monaco.languages.typescript.ScriptTarget.ESNext,
        module: monaco.languages.typescript.ModuleKind.ESNext,
        moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
        allowNonTsExtensions: true,
        allowJs: true,
        checkJs: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: false,
        noEmit: true,
        lib: ['esnext', 'dom', 'dom.iterable']
      });

      // ESNext and DOM libraries already provide console, timers, prompt,
      // fetch, Math, and other browser APIs without conflicting duplicate globals.

      // Richer word-based suggestions (so "con" suggests "console", "const", "continue",
      // plus identifiers already used in the file).
      monaco.languages.registerCompletionItemProvider('javascript', {
        // Run after the TS provider so our word completions don't crowd it out.
        triggerCharacters: [],
        provideCompletionItems: function (model, position) {
          const word = model.getWordUntilPosition(position);
          if (!word || word.word.length < 2) return { suggestions: [] };
          const prefix = word.word.toLowerCase();
          // Gather identifiers from the current file.
          const text = model.getValue();
          const re = /[A-Za-z_$][A-Za-z0-9_$]{1,}/g;
          const seen = new Set();
          const suggestions = [];
          let m;
          while ((m = re.exec(text)) !== null) {
            const w = m[0];
            if (w === word.word) continue;
            if (w.toLowerCase().startsWith(prefix)) {
              if (!seen.has(w)) {
                seen.add(w);
                suggestions.push({
                  label: w,
                  kind: monaco.languages.CompletionItemKind.Text,
                  insertText: w,
                  range: {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn: word.startColumn,
                    endColumn: word.endColumn
                  },
                  sortText: '~' + w
                });
              }
            }
            if (suggestions.length >= 30) break;
          }
          return { suggestions: suggestions };
        }
      });

      // Register JavaScript snippets.
      if (JSP.Snippets) JSP.Snippets.register(monaco);

      const settings = State.settings;

      this.editor = monaco.editor.create(container, {
        value: '',
        language: 'javascript',
        theme: settings.theme === 'light' ? 'jsp-light' : 'jsp-dark',
        automaticLayout: true,
        fontSize: settings.fontSize,
        tabSize: settings.tabSize,
        insertSpaces: true,
        wordWrap: settings.wordWrap ? 'on' : 'off',
        minimap: { enabled: settings.minimap && window.innerWidth > 768 },
        lineNumbers: 'on',
        roundedSelection: false,
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        bracketPairColorization: { enabled: true },
        guides: { bracketPairs: true, indentation: true },
        autoClosingBrackets: 'languageDefined',
        autoClosingQuotes: 'languageDefined',
        formatOnPaste: true,
        formatOnType: false,
        suggestOnTriggerCharacters: true,
        quickSuggestions: { other: true, comments: false, strings: true },
        parameterHints: { enabled: true },
        hover: { enabled: true, above: false },
        folding: true,
        foldingHighlight: true,
        links: true,
        multiCursorModifier: 'ctrlCmd',
        renderWhitespace: 'selection',
        renderLineHighlight: 'all',
        scrollbar: {
          verticalScrollbarSize: 12,
          horizontalScrollbarSize: 12,
          alwaysConsumeMouseWheel: false
        },
        find: {
          addExtraSpaceOnTop: false,
          autoFindInSelection: 'multiline',
          seedSearchStringFromSelection: 'selection'
        },
        fontFamily: 'var(--font-mono)',
        fontLigatures: true
      });

      State.editor = this.editor;

      // Wire up editor events.
      this.editor.onDidChangeModelContent(() => this._onContentChange());
      this.editor.onDidChangeCursorPosition((e) => this._onCursorChange(e));
      this.editor.onDidChangeModel((e) => {
        this._updateCursorStatus();
      });

      this._registerActions();

      // Markers -> Problems panel.
      monaco.editor.onDidChangeMarkers(() => {
        this._updateProblems();
      });

      // Apply initial content.
      const empty = document.getElementById('editor-empty');
      if (empty && State.activeFileId) empty.hidden = true;
      this.restoreActiveFile();
      this._updateCursorStatus();
      this._updateProblems();

      return this.editor;
    },

    /** Translate a normalized chord (e.g. "ctrl+shift+p") to a Monaco keybinding. */
    _chordToMonaco(chord) {
      if (!chord) return null;
      const monaco = this.monaco;
      if (!monaco) return null;
      if (chord.includes('>')) return null;
      const parts = chord.split('+');
      const mac = JSP.KeyBindings && JSP.KeyBindings.detectPlatform && JSP.KeyBindings.detectPlatform() === 'mac';
      let mods = 0;
      let key = null;
      for (const p of parts) {
        if (p === 'ctrl') mods |= mac ? monaco.KeyMod.WinCtrl : monaco.KeyMod.CtrlCmd;
        else if (p === 'meta') mods |= mac ? monaco.KeyMod.CtrlCmd : monaco.KeyMod.WinCtrl;
        else if (p === 'shift') mods |= monaco.KeyMod.Shift;
        else if (p === 'alt') mods |= monaco.KeyMod.Alt;
        else key = p;
      }
      if (!key) return null;
      const kc = this._keyCodeFor(key);
      if (kc == null) return null;
      return mods | kc;
    },

    _keyCodeFor(key) {
      const monaco = this.monaco;
      if (!monaco) return null;
      const k = key.toLowerCase();
      if (k.length === 1 && /^[a-z0-9]$/.test(k)) {
        // Monaco uses KeyCode.KeyA..KeyZ and Digit0..9.
        if (/^[0-9]$/.test(k)) return monaco.KeyCode['Digit' + k];
        return monaco.KeyCode['Key' + k.toUpperCase()];
      }
      const map = {
        enter: monaco.KeyCode.Enter,
        escape: monaco.KeyCode.Escape,
        esc: monaco.KeyCode.Escape,
        tab: monaco.KeyCode.Tab,
        space: monaco.KeyCode.Space,
        backspace: monaco.KeyCode.Backspace,
        delete: monaco.KeyCode.Delete,
        ',': monaco.KeyCode.Comma,
        '.': monaco.KeyCode.Period,
        '/': monaco.KeyCode.Slash,
        ';': monaco.KeyCode.Semicolon,
        '[': monaco.KeyCode.US_CLOSE_SQUARE_BRACKET || 147,
        ']': monaco.KeyCode.US_OPEN_SQUARE_BRACKET || 148,
        '-': monaco.KeyCode.Minus,
        '=': monaco.KeyCode.US_EQUAL || 143,
        '`': monaco.KeyCode.BackTick,
        f1: monaco.KeyCode.F1, f2: monaco.KeyCode.F2, f3: monaco.KeyCode.F3, f4: monaco.KeyCode.F4,
        f5: monaco.KeyCode.F5, f6: monaco.KeyCode.F6, f7: monaco.KeyCode.F7, f8: monaco.KeyCode.F8,
        f9: monaco.KeyCode.F9, f10: monaco.KeyCode.F10, f11: monaco.KeyCode.F11, f12: monaco.KeyCode.F12
      };
      return map[k] != null ? map[k] : null;
    },

    _registerActions() {
      if (!this.editor || !this.monaco) return;
      // Dispose any previously-registered actions.
      _actionDisposables.forEach((d) => { try { d.dispose(); } catch (_) {} });
      _actionDisposables = [];
      const add = (id, label, actionId, run) => {
        const chord = JSP.KeyBindings ? JSP.KeyBindings.chordFor(actionId) : null;
        const kb = this._chordToMonaco(chord);
        const opts = { id: id, label: label, run: run, precondition: null, keybindingContext: null, contextMenuGroupId: null, contextMenuOrder: 0 };
        if (kb) opts.keybindings = [kb];
        const d = this.editor.addAction(opts);
        if (d && d.dispose) _actionDisposables.push(d);
      };
      add('jsp.run-code', 'Run JavaScript', 'run', () => JSP.Commands.run('shortcut'));
      add('jsp.save', 'Save File', 'save', () => JSP.Commands.save());
      add('jsp.command-palette', 'Command Palette', 'commandPalette', () => JSP.UI.openCommandPalette());
      add('jsp.quick-open', 'Quick Open', 'quickOpen', () => JSP.UI.openQuickOpen());
      add('jsp.toggle-sidebar', 'Toggle Sidebar', 'toggleSidebar', () => JSP.Commands.toggleSidebar());
      add('jsp.format', 'Format Document', 'formatDocument', () => this.formatDocument());
      add('jsp.new-file', 'New File', 'newFile', () => JSP.Commands.newFile());
      add('jsp.close-tab', 'Close File', 'closeFile', () => JSP.Commands.closeActiveFile());
      add('jsp.clear-console', 'Clear Console', 'clearConsole', () => JSP.Commands.clearConsole());
    },

    /** Called after keybindings change so Monaco re-registers the new chords. */
    refreshActions() {
      this._registerActions();
    },

    /** Get (or create) a Monaco model for a file. */
    getModel(file) {
      const monaco = this.monaco;
      if (!monaco) return null;
      let model = State.models.get(file.id);
      if (model) return model;
      const uri = monaco.Uri.parse('inmemory://playground/' + file.id + '/' + file.name);
      model = monaco.editor.createModel(file.content || '', 'javascript', uri);
      model.updateOptions({ tabSize: State.settings.tabSize, insertSpaces: true });
      State.models.set(file.id, model);

      model.onDidChangeContent(() => {
        // Keep State.file.content in sync (State is source of truth for storage).
        file.content = model.getValue();
        // Update tab dirty indicator (lightweight — only mutates current tab).
        JSP.UI.updateTabDirtyState(file.id);
        // Auto-save (debounced in UI/state layer).
        if (State.settings.autoSave) {
          JSP.Commands.scheduleAutoSave(file.id);
        } else {
          JSP.UI.updateSaveStatus('unsaved');
        }
      });

      return model;
    },

    /** Switch the editor to the given file (preserving view state). */
    openFile(fileId) {
      const file = State.files.get(fileId);
      if (!file || !this.editor) return;

      // Preserve view state of currently-active model.
      if (State.activeFileId) {
        try {
          State.viewStates.set(State.activeFileId, this.editor.saveViewState());
        } catch (_) {}
      }

      // Plain-textarea fallback (Monaco unavailable).
      if (this._fallbackTextarea) {
        const empty = document.getElementById('editor-empty');
        if (empty) empty.hidden = true;
        this._fallbackTextarea.value = file.content || '';
        State.activeFileId = fileId;
        if (!State.openTabs.includes(fileId)) State.openTabs.push(fileId);
        const vs = State.viewStates.get(fileId);
        try { this.editor.restoreViewState(vs); } catch (_) {}
        if (JSP.UI) {
          JSP.UI.renderTabs();
          JSP.UI.renderFileTree();
          JSP.UI.updateBreadcrumb();
        }
        if (JSP.Commands && State.ready) JSP.Commands.persistState();
        this._updateFallbackCursor(this._fallbackTextarea);
        this._fallbackTextarea.focus();
        return;
      }

      const model = this.getModel(file);
      if (!model) return;

      const empty = document.getElementById('editor-empty');
      if (empty) empty.hidden = true;
      this.editor.setModel(model);
      const vs = State.viewStates.get(fileId);
      if (vs) {
        try { this.editor.restoreViewState(vs); } catch (_) {}
      }
      State.activeFileId = fileId;

      if (!State.openTabs.includes(fileId)) {
        State.openTabs.push(fileId);
      }

      JSP.UI.renderTabs();
      JSP.UI.renderFileTree();
      JSP.UI.updateBreadcrumb();
      if (JSP.Commands && State.ready) JSP.Commands.persistState();
      this._updateCursorStatus();
      this.editor.focus();
    },

    /** Restore whatever file should be active on boot. */
    restoreActiveFile() {
      if (State.activeFileId && State.files.has(State.activeFileId)) {
        this.openFile(State.activeFileId);
      } else if (State.openTabs.length > 0) {
        const id = State.openTabs.find((id) => State.files.has(id));
        if (id) this.openFile(id);
      } else {
        // Show empty state (no model).
        try { this.editor.setModel(null); } catch (_) {}
        const empty = document.getElementById('editor-empty');
        if (empty) empty.hidden = false;
      }
    },

    /** Read current content from the active model and push into State. */
    _onContentChange() {
      // The model's own listener updates file.content; nothing extra needed here.
    },

    _onCursorChange(e) {
      this._updateCursorStatus();
    },

    _updateCursorStatus() {
      const pos = this.editor ? this.editor.getPosition() : null;
      if (pos) {
        const el = document.getElementById('status-cursor');
        if (el) el.textContent = 'Ln ' + pos.lineNumber + ', Col ' + pos.column;
      }
    },

    _updateProblems() {
      const monaco = this.monaco;
      if (!monaco) return;
      const list = document.getElementById('problems-list');
      const countEl = document.getElementById('problem-count');
      if (!list) return;
      list.innerHTML = '';
      let count = 0;
      const activeModel = this.editor ? this.editor.getModel() : null;
      const models = monaco.editor.getModels();
      const problems = [];
      for (const m of models) {
        const markers = monaco.editor.getModelMarkers({ resource: m.uri });
        for (const marker of markers) {
          // Try to map URI back to a file id.
          let fileId = null;
          for (const [fid, model] of State.models.entries()) {
            if (model === m) { fileId = fid; break; }
          }
          problems.push({ marker, fileId, model: m });
        }
      }
      count = problems.length;
      for (const p of problems) {
        const li = document.createElement('li');
        const icon = document.createElement('span');
        icon.className = p.marker.severity === monaco.MarkerSeverity.Error ? 'sev-error' : 'sev-warning';
        icon.textContent = p.marker.severity === monaco.MarkerSeverity.Error ? '✕' : '⚠';
        const text = document.createElement('span');
        const fname = p.fileId ? State.files.get(p.fileId)?.name : p.model.uri.path.split('/').pop();
        text.textContent = (fname || '?') + ':' + (p.marker.startLineNumber) + '  ' + p.marker.message;
        li.appendChild(icon);
        li.appendChild(text);
        if (p.fileId) {
          li.tabIndex = 0;
          li.style.cursor = 'pointer';
          li.addEventListener('click', () => {
            this.openFile(p.fileId);
            this.editor.revealPositionInCenter({ lineNumber: p.marker.startLineNumber, column: p.marker.startColumn || 1 });
            this.editor.setPosition({ lineNumber: p.marker.startLineNumber, column: p.marker.startColumn || 1 });
            this.editor.focus();
            JSP.UI.switchConsoleTab('problems');
          });
        }
        list.appendChild(li);
      }
      if (count === 0) {
        const li = document.createElement('li');
        li.style.color = 'var(--text-dim)';
        li.textContent = 'No problems detected.';
        list.appendChild(li);
      }
      if (countEl) {
        if (count > 0) {
          countEl.textContent = String(count);
          countEl.hidden = false;
        } else {
          countEl.hidden = true;
        }
      }
    },

    /** Apply settings (called when settings change). */
    applySettings(prev) {
      if (!this.editor) return;
      const s = State.settings;
      this.editor.updateOptions({
        fontSize: s.fontSize,
        tabSize: s.tabSize,
        wordWrap: s.wordWrap ? 'on' : 'off',
        minimap: { enabled: s.minimap && window.innerWidth > 768 }
      });
      // Update all model tab sizes.
      for (const m of State.models.values()) {
        if (m && m.updateOptions) m.updateOptions({ tabSize: s.tabSize });
      }
      if (this.monaco && this.monaco.editor) {
        this.monaco.editor.setTheme(s.theme === 'light' ? 'jsp-light' : 'jsp-dark');
      }
    },

    /** Format the active document. */
    formatDocument() {
      if (!this.editor) return;
      const action = this.editor.getAction('editor.action.formatDocument');
      if (action) {
        Promise.resolve(action.run()).catch(() => {
          // Fallback: simple formatting if the TS formatter isn't available.
          simpleFormat(this.editor);
        });
      } else {
        simpleFormat(this.editor);
      }
    },

    /**
     * Plain-textarea editor used when Monaco cannot be loaded (offline, CDN
     * blocked, etc.). Implements the tiny subset of the Monaco API that the
     * rest of the app touches so Run / Save / tabs keep working.
     */
    _installFallbackEditor(container, reason) {
      const file = State.activeFileId ? State.files.get(State.activeFileId) : null;
      const wrap = document.createElement('div');
      wrap.className = 'fallback-editor-wrap';
      wrap.style.cssText = 'display:flex;flex-direction:column;height:100%;min-height:0;';
      const note = document.createElement('div');
      note.className = 'editor-empty';
      note.style.cssText = 'flex:0 0 auto;height:auto;padding:8px 12px;font-size:12px;';
      note.textContent = 'Using a basic editor — Monaco could not be loaded' + (reason ? ' (' + reason + ')' : '') + '. Run still works.';
      const ta = document.createElement('textarea');
      ta.id = 'fallback-editor';
      ta.setAttribute('spellcheck', 'false');
      ta.setAttribute('aria-label', 'JavaScript editor');
      ta.style.cssText = 'flex:1;min-height:0;width:100%;resize:none;border:0;outline:none;padding:12px 14px;background:var(--bg-editor);color:var(--text);font-family:var(--font-mono);font-size:' + (State.settings.fontSize || 15) + 'px;line-height:1.5;tab-size:' + (State.settings.tabSize || 2) + ';';
      ta.value = file ? (file.content || '') : '';
      wrap.appendChild(note);
      wrap.appendChild(ta);
      container.innerHTML = '';
      container.appendChild(wrap);

      const self = this;
      ta.addEventListener('input', () => {
        const f = State.files.get(State.activeFileId);
        if (f) {
          f.content = ta.value;
          if (JSP.UI && JSP.UI.updateTabDirtyState) JSP.UI.updateTabDirtyState(f.id);
          if (JSP.UI && JSP.UI.renderOutline) JSP.UI.renderOutline();
        }
        if (State.settings.autoSave && JSP.Commands) JSP.Commands.scheduleAutoSave(f && f.id);
        else if (JSP.UI) JSP.UI.updateSaveStatus('unsaved');
      });
      ta.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          if (JSP.Commands) {
            if (e.shiftKey && JSP.Commands.runSelection) JSP.Commands.runSelection('shortcut');
            else JSP.Commands.run('shortcut');
          }
        } else if (e.key === 'Tab') {
          e.preventDefault();
          const start = ta.selectionStart;
          const end = ta.selectionEnd;
          const spaces = ' '.repeat(State.settings.tabSize || 2);
          ta.value = ta.value.slice(0, start) + spaces + ta.value.slice(end);
          ta.selectionStart = ta.selectionEnd = start + spaces.length;
          ta.dispatchEvent(new Event('input'));
        }
      });
      ta.addEventListener('click', () => self._updateFallbackCursor(ta));
      ta.addEventListener('keyup', () => self._updateFallbackCursor(ta));

      this._fallbackTextarea = ta;
      this.editor = {
        getModel: () => ({
          getValue: () => ta.value,
          setValue: (v) => { ta.value = v; }
        }),
        getValue: () => ta.value,
        setValue: (v) => { ta.value = v; },
        getPosition: () => self._fallbackPosition(ta),
        focus: () => ta.focus(),
        layout: () => {},
        updateOptions: (opts) => {
          if (opts && opts.fontSize) ta.style.fontSize = opts.fontSize + 'px';
          if (opts && opts.tabSize) ta.style.tabSize = String(opts.tabSize);
          if (opts && opts.fontFamily) ta.style.fontFamily = opts.fontFamily;
          if (opts && opts.wordWrap) ta.style.whiteSpace = opts.wordWrap === 'on' ? 'pre-wrap' : 'pre';
        },
        setModel: () => {},
        saveViewState: () => ({ sel: [ta.selectionStart, ta.selectionEnd], scroll: ta.scrollTop }),
        restoreViewState: (vs) => {
          if (!vs) return;
          if (vs.sel) { ta.selectionStart = vs.sel[0]; ta.selectionEnd = vs.sel[1]; }
          if (typeof vs.scroll === 'number') ta.scrollTop = vs.scroll;
        },
        getAction: () => null,
        addAction: () => ({ dispose: () => {} }),
        getSelection: () => ({ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }),
        executeEdits: (_src, edits) => {
          if (edits && edits[0] && typeof edits[0].text === 'string') {
            ta.value += edits[0].text;
          }
        },
        onDidChangeModelContent: () => ({ dispose: () => {} }),
        onDidChangeCursorPosition: () => ({ dispose: () => {} }),
        onDidChangeModel: () => ({ dispose: () => {} }),
        revealPositionInCenter: () => {},
        setPosition: () => {}
      };
      State.editor = this.editor;
      const empty = document.getElementById('editor-empty');
      if (empty && State.activeFileId) empty.hidden = true;
      this._updateFallbackCursor(ta);
    },

    _fallbackPosition(ta) {
      const value = ta.value.slice(0, ta.selectionStart);
      const lines = value.split('\n');
      return { lineNumber: lines.length, column: lines[lines.length - 1].length + 1 };
    },

    _updateFallbackCursor(ta) {
      const pos = this._fallbackPosition(ta);
      const el = document.getElementById('status-cursor');
      if (el) el.textContent = 'Ln ' + pos.lineNumber + ', Col ' + pos.column;
    },

    /** Focus the editor. */
    focus() {
      if (this._fallbackTextarea) {
        this._fallbackTextarea.focus();
        return;
      }
      if (this.editor) this.editor.focus();
    },

    /** Insert text at cursor (used by completions? not needed — Monaco handles its own). */
    insertText(text) {
      if (!this.editor) return;
      const sel = this.editor.getSelection();
      this.editor.executeEdits('jsp-insert', [{ range: sel, text: text, forceMoveMarkers: true }]);
      this.editor.focus();
    }
  };

  /** Very small fallback JS formatter (only used if Monaco's action is unavailable). */
  function simpleFormat(editor) {
    const model = editor.getModel();
    if (!model) return;
    const code = model.getValue();
    // Conservative: only normalize leading/trailing whitespace per line and final newline.
    const lines = code.split('\n').map((l) => l.replace(/\s+$/, ''));
    // Trim trailing blank lines, ensure one final newline.
    while (lines.length > 1 && lines[lines.length - 1].trim() === '') lines.pop();
    const formatted = lines.join('\n') + '\n';
    if (formatted !== code) model.setValue(formatted);
  }

  JSP.Editor = EditorModule;
})(window);
