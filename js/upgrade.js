/* ============ upgrade.js ============
 * Focused extensions for the existing JS Playground architecture.
 * This file deliberately layers on top of the stable modules instead of
 * replacing Monaco, the virtual filesystem, IndexedDB, or the worker.
 */
(function (global) {
  'use strict';

  const JSP = global.JSP || (global.JSP = {});
  const State = JSP.State;
  const Utils = JSP.Utils;
  const UI = JSP.UI;
  const Editor = JSP.Editor;
  const Commands = JSP.Commands;
  const Execution = JSP.Execution;
  const Filesystem = JSP.Filesystem;
  const KeyBindings = JSP.KeyBindings;

  const HISTORY_KEY = 'jsp.run-history';
  const OUTPUT_KEY = 'jsp.output-messages';
  const MAX_HISTORY = 80;
  const DEFAULT_LAYOUT = { explorerWidth: 252, panelHeight: 280, panelWidth: 380 };

  // Settings created by older versions are intentionally accepted and filled
  // with safe defaults so an upgrade never loses a user's project.
  Object.assign(State.settings, {
    theme: State.settings.theme || 'dark',
    fontFamily: State.settings.fontFamily || 'JetBrains Mono',
    ligatures: State.settings.ligatures !== false,
    lineNumbers: State.settings.lineNumbers !== false,
    confirmClose: State.settings.confirmClose !== false,
    restoreTabs: State.settings.restoreTabs !== false,
    explorerWidth: clamp(Number(State.settings.explorerWidth) || DEFAULT_LAYOUT.explorerWidth, 200, 400),
    panelWidth: clamp(Number(State.settings.panelWidth) || DEFAULT_LAYOUT.panelWidth, 240, 520),
    panelHeight: clamp(Number(State.settings.panelHeight) || DEFAULT_LAYOUT.panelHeight, 120, 900)
  });

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function safeText(value) {
    return value == null ? '' : String(value);
  }

  function nowLabel(timestamp) {
    try {
      return new Date(timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return '';
    }
  }

  function filePath(fileId) {
    return State.getPath(fileId) || (State.files.get(fileId) || {}).name || 'untitled.js';
  }

  function activeSource() {
    const file = State.files.get(State.activeFileId);
    if (!file) return '';
    if (Editor.editor && Editor.editor.getModel) {
      const model = Editor.editor.getModel();
      if (model && model.getValue) {
        file.content = model.getValue();
        return file.content;
      }
    }
    return file.content || '';
  }

  function openOrFocusFile(fileId, line, column, endColumn) {
    if (!fileId || !State.files.has(fileId)) return;
    Editor.openFile(fileId);
    const target = { lineNumber: Math.max(1, Number(line) || 1), column: Math.max(1, Number(column) || 1) };
    if (Editor._fallbackTextarea) {
      const textarea = Editor._fallbackTextarea;
      const lines = textarea.value.split('\\n');
      let offset = 0;
      for (let i = 1; i < target.lineNumber; i++) offset += (lines[i - 1] || '').length + 1;
      const start = Math.min(textarea.value.length, offset + target.column - 1);
      const end = Math.min(textarea.value.length, start + Math.max(1, (Number(endColumn) || target.column) - target.column));
      textarea.selectionStart = start;
      textarea.selectionEnd = end;
      textarea.focus();
      return;
    }
    if (Editor.editor && Editor.editor.setPosition && Editor.editor.revealPositionInCenter) {
      try {
        Editor.editor.setPosition(target);
        Editor.editor.revealPositionInCenter(target);
        if (Editor.editor.setSelection && endColumn) {
          Editor.editor.setSelection({
            startLineNumber: target.lineNumber,
            startColumn: target.column,
            endLineNumber: target.lineNumber,
            endColumn: Math.max(target.column, Number(endColumn) || target.column)
          });
        }
        Editor.editor.focus();
      } catch (_) {}
    }
  }

  /* ------------------------------------------------------------------
   * DOM additions and panel views
   * ---------------------------------------------------------------- */
  const originalCacheDom = UI.cacheDom;
  UI.cacheDom = function () {
    originalCacheDom.call(this);
    Object.assign(this.dom, {
      outputBody: document.getElementById('output-body'),
      outputList: document.getElementById('output-list'),
      previewBody: document.getElementById('preview-body'),
      previewFrame: document.getElementById('preview-frame'),
      projectSearchOverlay: document.getElementById('project-search-overlay'),
      projectSearchInput: document.getElementById('project-search-input'),
      projectSearchResults: document.getElementById('project-search-results'),
      searchCaseSensitive: document.getElementById('search-case-sensitive'),
      searchWholeWord: document.getElementById('search-whole-word'),
      inputDialog: document.getElementById('input-dialog'),
      inputMessage: document.getElementById('input-message'),
      inputValue: document.getElementById('input-value'),
      practiceDialog: document.getElementById('practice-dialog'),
      practiceContent: document.getElementById('practice-content'),
      outlineList: document.getElementById('outline-list'),
      historyList: document.getElementById('history-list'),
      mobileMenu: document.getElementById('btn-mobile-menu'),
      practiceButton: document.getElementById('btn-practice'),
      emptyNewFile: document.getElementById('empty-new-file'),
      emptyOpenExamples: document.getElementById('empty-open-examples'),
      refreshOutline: document.getElementById('btn-refresh-outline'),
      refreshTree: document.getElementById('btn-refresh-tree'),
      clearHistory: document.getElementById('btn-clear-history'),
      refreshPreview: document.getElementById('btn-refresh-preview'),
      openPreview: document.getElementById('btn-open-preview'),
      clearPreview: document.getElementById('btn-clear-preview'),
      projectSearchClose: document.getElementById('project-search-close'),
      setFontFamily: document.getElementById('set-font-family'),
      setLigatures: document.getElementById('set-ligatures'),
      setLineNumbers: document.getElementById('set-line-numbers'),
      setConfirmClose: document.getElementById('set-confirm-close'),
      setRestoreTabs: document.getElementById('set-restore-tabs')
    });
  };

  UI._upgradeBound = false;
  const originalUIInit = UI.init;
  UI.init = function () {
    originalUIInit.call(this);
    if (!this._upgradeBound) bindUpgradeEvents();
  };

  function bindUpgradeEvents() {
    UI._upgradeBound = true;
    const d = UI.dom;

    if (d.mobileMenu) {
      d.mobileMenu.hidden = window.innerWidth > 768;
      d.mobileMenu.addEventListener('click', () => Commands.toggleSidebar(true));
      window.addEventListener('resize', () => {
        d.mobileMenu.hidden = window.innerWidth > 768;
        document.body.classList.toggle('no-minimap', window.innerWidth <= 768);
        if (Editor.editor && Editor.editor.updateOptions) Editor.editor.updateOptions({ minimap: { enabled: State.settings.minimap && window.innerWidth > 768 } });
      });
    }
    if (d.emptyNewFile) d.emptyNewFile.addEventListener('click', () => Commands.newFile());
    if (d.emptyOpenExamples) d.emptyOpenExamples.addEventListener('click', () => {
      const examples = document.querySelector('.sidebar .tree-node[data-id] .tree-row');
      const folder = Array.from(State.project && State.project.children || []).find((n) => n.type === 'folder' && n.name === 'examples');
      if (folder) {
        Filesystem.toggleExpand(folder.id, true);
        UI.renderFileTree();
      }
      if (State.files.size) {
        const example = Array.from(State.files.values()).find((f) => State.getPath(f.id).startsWith('examples/'));
        if (example) Editor.openFile(example.id);
      }
    });
    if (d.refreshOutline) d.refreshOutline.addEventListener('click', () => UI.renderOutline());
    if (d.refreshTree) d.refreshTree.addEventListener('click', () => { UI.renderFileTree(); UI.appendOutput('Explorer refreshed', 'system'); });
    if (d.clearHistory) d.clearHistory.addEventListener('click', () => {
      State.runHistory = [];
      persistHistory();
      UI.renderHistory();
      UI.toast('Run history cleared', 'success');
    });
    if (d.practiceButton) d.practiceButton.addEventListener('click', () => UI.openPractice());

    if (d.refreshPreview) d.refreshPreview.addEventListener('click', () => UI.refreshPreview());
    if (d.clearPreview) d.clearPreview.addEventListener('click', () => UI.clearPreview());
    if (d.openPreview) d.openPreview.addEventListener('click', () => UI.openPreviewWindow());

    if (d.projectSearchClose) d.projectSearchClose.addEventListener('click', () => UI.closeProjectSearch());
    if (d.projectSearchOverlay) {
      d.projectSearchOverlay.addEventListener('mousedown', (event) => {
        if (event.target === d.projectSearchOverlay) UI.closeProjectSearch();
      });
    }
    [d.projectSearchInput, d.searchCaseSensitive, d.searchWholeWord].forEach((el) => {
      if (el) el.addEventListener('input', () => UI.renderProjectSearch());
    });

    // The existing UI binds console tabs too. The replacement below is used
    // by those listeners and by commands so all four views share one state.
    document.querySelectorAll('.console-tab').forEach((tab) => {
      tab.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          const tabs = Array.from(document.querySelectorAll('.console-tab'));
          const index = tabs.indexOf(tab);
          const next = event.key === 'ArrowRight' ? index + 1 : index - 1;
          if (tabs[next]) { event.preventDefault(); tabs[next].focus(); tabs[next].click(); }
        }
      });
    });

    bindExtraSettings();
    setupExplorerResize();
    setupTouchPanelResize();
    setupDragAndDrop();
    updateShortcutHints();
    if (State.settings.panelPosition === 'hidden') UI.dom.workspace.classList.add('console-hidden');
    if (window.innerWidth <= 768 && UI.dom.main) UI.dom.main.classList.add('sidebar-hidden');
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (UI._inputCancel) { event.preventDefault(); UI.cancelInput(); return; }
      if (UI.dom.projectSearchOverlay && !UI.dom.projectSearchOverlay.hidden) { event.preventDefault(); UI.closeProjectSearch(); }
    });
  }

  const originalSwitchPanel = UI.switchConsoleTab;
  UI.switchConsoleTab = function (panel) {
    // Calls from the old execution path used "output" for the console. The
    // Commands wrapper below corrects those calls; direct callers get the new
    // explicit four-tab vocabulary.
    panel = panel || 'console';
    if (!['console', 'problems', 'output', 'preview'].includes(panel)) panel = 'console';
    State.activePanel = panel;
    const d = this.dom;
    const views = {
      console: d.consoleBody,
      problems: d.problemsBody,
      output: d.outputBody,
      preview: d.previewBody
    };
    Object.keys(views).forEach((key) => {
      if (views[key]) views[key].hidden = key !== panel;
    });
    document.querySelectorAll('.console-tab').forEach((tab) => {
      const active = tab.dataset.panel === panel;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    if (d.workspace && d.workspace.classList.contains('console-hidden')) {
      d.workspace.classList.remove('console-hidden');
      setTimeout(() => { if (Editor.editor && Editor.editor.layout) Editor.editor.layout(); }, 20);
    }
    if (panel === 'preview') this.refreshPreview();
    if (panel === 'problems' && Editor._updateProblems) Editor._updateProblems();
  };

  const originalCloseAllOverlays = UI.closeAllOverlays;
  UI.closeAllOverlays = function () {
    originalCloseAllOverlays.call(this);
    if (this.dom.projectSearchOverlay) this.dom.projectSearchOverlay.hidden = true;
  };

  UI.appendOutput = function (message, kind) {
    const text = safeText(message);
    if (!text || !this.dom.outputList) return;
    const item = document.createElement('li');
    item.className = 'output-item';
    const icon = document.createElement('span');
    icon.className = 'output-icon';
    icon.textContent = kind === 'error' ? '!' : kind === 'success' ? '✓' : '›';
    const copy = document.createElement('span');
    copy.textContent = text;
    const time = document.createElement('time');
    time.className = 'output-time';
    time.textContent = nowLabel();
    time.dateTime = new Date().toISOString();
    item.append(icon, copy, time);
    this.dom.outputList.appendChild(item);
    State.outputMessages = (State.outputMessages || []).concat([{ message: text, kind: kind || 'system', timestamp: Date.now() }]).slice(-200);
    this.dom.outputBody.scrollTop = this.dom.outputBody.scrollHeight;
  };

  UI.renderOutput = function () {
    if (!this.dom.outputList) return;
    this.dom.outputList.textContent = '';
    (State.outputMessages || []).forEach((item) => {
      const li = document.createElement('li');
      li.className = 'output-item';
      const icon = document.createElement('span');
      icon.className = 'output-icon';
      icon.textContent = item.kind === 'error' ? '!' : item.kind === 'success' ? '✓' : '›';
      const msg = document.createElement('span');
      msg.textContent = item.message;
      const time = document.createElement('time');
      time.className = 'output-time';
      time.textContent = nowLabel(item.timestamp);
      li.append(icon, msg, time);
      this.dom.outputList.appendChild(li);
    });
  };

  function primitiveText(value) {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' && Number.isNaN(value)) return 'NaN';
    if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
    if (typeof value === 'boolean' || typeof value === 'number') return String(value);
    if (value && value.__bigint !== undefined) return value.__bigint;
    if (value && value.__text !== undefined) return value.__text;
    return null;
  }

  function renderValue(value, depth, seen) {
    depth = depth || 0;
    seen = seen || new Set();
    const primitive = primitiveText(value);
    if (primitive !== null) {
      const span = document.createElement('span');
      span.className = 'console-primitive ' + (typeof value === 'string' ? 'string' : typeof value === 'number' ? 'number' : '');
      span.textContent = typeof value === 'string' ? value : primitive;
      return span;
    }
    if (value instanceof Error) {
      const span = document.createElement('span');
      span.className = 'console-primitive string';
      span.textContent = value.name + ': ' + value.message;
      return span;
    }
    if (value instanceof Date) {
      const span = document.createElement('span');
      span.textContent = value.toISOString();
      return span;
    }
    if (!value || typeof value !== 'object') {
      const span = document.createElement('span');
      span.textContent = String(value);
      return span;
    }
    if (seen.has(value)) {
      const span = document.createElement('span');
      span.textContent = '[Circular]';
      return span;
    }
    seen.add(value);

    let entries = [];
    let label = 'Object';
    if (Array.isArray(value)) {
      label = 'Array(' + value.length + ')';
      entries = value.map((item, index) => [String(index), item]);
    } else if (value instanceof Map) {
      label = 'Map(' + value.size + ')';
      entries = Array.from(value.entries()).map((entry, index) => [String(index), entry[0] + ' → ' + entry[1]]);
    } else if (value instanceof Set) {
      label = 'Set(' + value.size + ')';
      entries = Array.from(value.values()).map((item, index) => [String(index), item]);
    } else {
      label = 'Object';
      entries = Object.keys(value).map((key) => [key, value[key]]);
    }
    if (!entries.length) {
      const span = document.createElement('span');
      span.textContent = label + ' {}';
      return span;
    }
    const details = document.createElement('details');
    details.className = 'console-object';
    // Keep the first level open for useful learning output; deep values stay collapsed.
    if (depth === 0) details.open = true;
    const summary = document.createElement('summary');
    summary.textContent = label;
    details.appendChild(summary);
    const children = document.createElement('div');
    children.className = 'console-object-children';
    entries.slice(0, 100).forEach(([key, item]) => {
      const row = document.createElement('div');
      row.className = 'console-property';
      const keyEl = document.createElement('span');
      keyEl.className = 'console-property-key';
      keyEl.textContent = key + ':';
      const valueEl = document.createElement('span');
      valueEl.className = 'console-property-value';
      valueEl.appendChild(renderValue(item, depth + 1, new Set(seen)));
      row.append(keyEl, valueEl);
      children.appendChild(row);
    });
    if (entries.length > 100) {
      const more = document.createElement('div');
      more.className = 'console-property';
      more.textContent = '… +' + (entries.length - 100) + ' more';
      children.appendChild(more);
    }
    details.appendChild(children);
    return details;
  }

  function renderTable(data) {
    const wrap = document.createElement('div');
    wrap.className = 'console-table-wrap';
    const table = document.createElement('table');
    table.className = 'console-table';
    const rows = Array.isArray(data) ? data : [data];
    const keys = new Set();
    rows.forEach((row) => {
      if (row && typeof row === 'object' && !Array.isArray(row)) Object.keys(row).forEach((key) => keys.add(key));
      else keys.add('(value)');
    });
    const columns = Array.from(keys).slice(0, 20);
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    columns.forEach((key) => { const th = document.createElement('th'); th.textContent = key; headRow.appendChild(th); });
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    rows.slice(0, 100).forEach((row) => {
      const tr = document.createElement('tr');
      columns.forEach((key) => {
        const td = document.createElement('td');
        const value = key === '(value)' ? row : row && typeof row === 'object' ? row[key] : undefined;
        td.appendChild(renderValue(value, 1));
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  // Replace only the presentation layer; worker values remain data, and all
  // labels are inserted with textContent so user objects cannot inject HTML.
  UI.appendConsole = function (level, args, meta) {
    if (level === 'system') {
      const messages = Array.isArray(args) ? args : [args];
      this.appendOutput(messages.map(safeText).join(' '), 'system');
      return;
    }
    const body = this.dom.consoleBody;
    if (!body) return;
    const empty = body.querySelector('.console-empty');
    if (empty) empty.remove();
    const line = document.createElement('div');
    line.className = 'console-line ' + (level || 'log');
    const icon = document.createElement('span');
    icon.className = 'cl-icon';
    icon.textContent = ({ log: '›', info: 'ℹ', warn: '⚠', error: '✕', debug: '●', success: '✓', result: '⇐' })[level] || '›';
    line.appendChild(icon);
    const text = document.createElement('span');
    text.className = 'cl-text';
    const values = Array.isArray(args) ? args : [args];
    if (meta && meta.table) {
      text.appendChild(renderTable(values.length === 1 ? values[0] : values));
    } else {
      values.forEach((value, index) => {
        if (index) text.appendChild(document.createTextNode(' '));
        text.appendChild(renderValue(value));
      });
    }
    line.appendChild(text);
    body.appendChild(line);
    if (Execution.isRunning()) {
      State._activeRunOutput = (State._activeRunOutput || []).concat([body.lastChild.textContent]);
    }
    this.scrollConsoleToBottom();
  };

  UI.appendError = function (err) {
    const message = err && err.name ? err.name + ': ' + err.message : String(err);
    this.appendConsole('error', [message + (err && err.line ? '  (line ' + err.line + ')' : '')]);
    if (err && err.stack) {
      const line = document.createElement('div');
      line.className = 'console-line error';
      const spacer = document.createElement('span');
      spacer.className = 'cl-icon';
      const stack = document.createElement('span');
      stack.className = 'cl-text';
      stack.style.opacity = '.65';
      stack.textContent = err.stack;
      line.append(spacer, stack);
      this.dom.consoleBody.appendChild(line);
    }
    if (Execution.isRunning()) State._activeRunHadError = true;
    this.scrollConsoleToBottom();
  };

  const originalClearConsole = UI.clearConsole;
  UI.clearConsole = function () {
    originalClearConsole.call(this);
    if (this.dom.consoleBody) this.dom.consoleBody.textContent = '';
  };

  /* ------------------------------------------------------------------
   * Problems: one live canonical collection, no stale badge.
   * ------------------------------------------------------------------ */
  Editor._problemHighlight = [];
  Editor._updateProblems = function () {
    const monaco = this.monaco;
    const list = document.getElementById('problems-list');
    const countEl = document.getElementById('problem-count');
    if (!list) return;
    if (!monaco || !monaco.editor) {
      State.diagnostics = [];
      if (countEl) { countEl.hidden = true; countEl.textContent = ''; }
      list.textContent = '';
      const empty = document.createElement('li'); empty.className = 'problems-empty'; empty.textContent = 'No problems detected.'; list.appendChild(empty);
      return;
    }
    const problems = [];
    for (const [fileId, model] of State.models.entries()) {
      if (!model || model.isDisposed && model.isDisposed()) continue;
      const markers = monaco.editor.getModelMarkers({ resource: model.uri }) || [];
      markers.forEach((marker) => {
        // Hints are useful in the editor but are not Problems. Errors and
        // warnings are the actionable diagnostics users expect in the badge.
        if (marker.severity === monaco.MarkerSeverity.Hint || marker.severity === monaco.MarkerSeverity.Info) return;
        problems.push({
          fileId,
          model,
          marker: {
            severity: marker.severity,
            message: marker.message,
            startLineNumber: marker.startLineNumber,
            startColumn: marker.startColumn,
            endLineNumber: marker.endLineNumber,
            endColumn: marker.endColumn
          }
        });
      });
    }
    State.diagnostics = problems;
    if (!problems.length && this.editor && this.editor.deltaDecorations && this._problemHighlight && this._problemHighlight.length) {
      this._problemHighlight = this.editor.deltaDecorations(this._problemHighlight, []);
    }
    list.textContent = '';
    if (countEl) {
      countEl.hidden = problems.length === 0;
      countEl.textContent = problems.length ? String(problems.length) : '';
    }
    if (!problems.length) {
      const empty = document.createElement('li');
      empty.className = 'problems-empty';
      empty.textContent = 'No problems detected.';
      list.appendChild(empty);
      return;
    }
    problems.forEach((problem) => {
      const item = document.createElement('li');
      item.tabIndex = 0;
      item.dataset.fileId = problem.fileId;
      item.dataset.line = String(problem.marker.startLineNumber);
      const icon = document.createElement('span');
      const isError = problem.marker.severity === monaco.MarkerSeverity.Error;
      icon.className = isError ? 'sev-error' : 'sev-warning';
      icon.textContent = isError ? '✕' : '⚠';
      const copy = document.createElement('span');
      const message = document.createElement('span');
      message.className = 'problem-message';
      message.textContent = problem.marker.message;
      const location = document.createElement('span');
      location.className = 'problem-location';
      location.textContent = filePath(problem.fileId) + ':' + problem.marker.startLineNumber + ':' + problem.marker.startColumn;
      copy.append(message, location);
      item.append(icon, copy);
      const go = () => {
        this.openFile(problem.fileId);
        const m = problem.marker;
        if (this.editor && this.editor.setSelection) {
          try {
            this.editor.setSelection({ startLineNumber: m.startLineNumber, startColumn: m.startColumn || 1, endLineNumber: m.endLineNumber || m.startLineNumber, endColumn: m.endColumn || (m.startColumn || 1) + 1 });
            this.editor.revealRangeInCenter && this.editor.revealRangeInCenter(m);
            this.editor.focus();
            this._highlightDiagnostic(m);
          } catch (_) {}
        }
        UI.switchConsoleTab('problems');
      };
      item.addEventListener('click', go);
      item.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); go(); } });
      list.appendChild(item);
    });
  };

  Editor._highlightDiagnostic = function (marker) {
    if (!this.monaco || !this.editor || !this.editor.deltaDecorations) return;
    this._problemHighlight = this.editor.deltaDecorations(this._problemHighlight || [], [{
      range: marker,
      options: { inlineClassName: 'jsp-diagnostic-highlight', className: 'jsp-diagnostic-line' }
    }]);
  };

  // Monaco markers arrive asynchronously. Coalescing them prevents one
  // model's old event from briefly leaving a stale number in the tab.
  Editor._scheduleProblemRefresh = Utils.debounce(() => Editor._updateProblems(), 0);
  const originalEditorInit = Editor.init;
  Editor.init = async function (container) {
    const result = await originalEditorInit.call(this, container);
    if (this.monaco && this.monaco.editor) {
      if (!this._upgradeMarkerListener) {
        this._upgradeMarkerListener = this.monaco.editor.onDidChangeMarkers(() => this._scheduleProblemRefresh());
      }
      this._scheduleProblemRefresh();
    }
    return result;
  };

  /* ------------------------------------------------------------------
   * Editor settings, selection execution, outline and breadcrumbs
   * ------------------------------------------------------------------ */
  Editor.getSelectedText = function () {
    if (!this.editor) return '';
    if (this._fallbackTextarea) {
      const ta = this._fallbackTextarea;
      return ta.selectionStart === ta.selectionEnd ? '' : ta.value.slice(ta.selectionStart, ta.selectionEnd);
    }
    const model = this.editor.getModel && this.editor.getModel();
    const selection = this.editor.getSelection && this.editor.getSelection();
    if (!model || !selection || selection.isEmpty && selection.isEmpty()) return '';
    try { return model.getValueInRange(selection); } catch (_) { return ''; }
  };

  Editor.getOutline = function () {
    const source = activeSource();
    const symbols = [];
    const lines = source.split('\n');
    const patterns = [
      { regex: /^\s*(?:export\s+)?(?:async\s+)?function\s+([\w$]+)/, kind: 'ƒ' },
      { regex: /^\s*(?:export\s+)?class\s+([\w$]+)/, kind: '◇' },
      { regex: /^\s*(?:export\s+)?(?:const|let|var)\s+([\w$]+)/, kind: '◇' },
      { regex: /^\s*(?:async\s+)?([\w$]+)\s*\([^)]*\)\s*\{/, kind: 'ƒ' }
    ];
    lines.forEach((line, index) => {
      for (const pattern of patterns) {
        const match = pattern.regex.exec(line);
        if (match) {
          symbols.push({ name: match[1], kind: pattern.kind, line: index + 1, column: Math.max(1, line.indexOf(match[1]) + 1) });
          break;
        }
      }
    });
    return symbols;
  };

  UI.renderOutline = function () {
    const list = this.dom.outlineList;
    if (!list) return;
    list.textContent = '';
    const symbols = Editor.getOutline();
    if (!State.activeFileId || !symbols.length) {
      const empty = document.createElement('p');
      empty.className = 'sidebar-empty';
      empty.textContent = State.activeFileId ? 'No symbols detected.' : 'Open a file to see its symbols.';
      list.appendChild(empty);
      return;
    }
    symbols.forEach((symbol) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'outline-item';
      const kind = document.createElement('span');
      kind.className = 'outline-kind';
      kind.textContent = symbol.kind;
      const name = document.createElement('span');
      name.className = 'outline-name';
      name.textContent = symbol.name;
      button.title = symbol.name + ' — line ' + symbol.line;
      button.append(kind, name);
      button.addEventListener('click', () => openOrFocusFile(State.activeFileId, symbol.line, symbol.column));
      list.appendChild(button);
    });
  };

  const originalBreadcrumb = UI.updateBreadcrumb;
  UI.updateBreadcrumb = function () {
    const bc = this.dom.breadcrumb;
    if (!bc) return originalBreadcrumb.call(this);
    bc.textContent = '';
    if (!State.activeFileId) return;
    const parts = filePath(State.activeFileId).split('/').filter(Boolean);
    parts.forEach((part, index) => {
      if (index) {
        const sep = document.createElement('span');
        sep.className = 'crumb-separator';
        sep.textContent = '/';
        bc.appendChild(sep);
      }
      const crumb = document.createElement('span');
      crumb.className = 'crumb';
      crumb.textContent = part;
      bc.appendChild(crumb);
    });
  };

  const originalEditorOpenFile = Editor.openFile;
  Editor.openFile = function (fileId) {
    const result = originalEditorOpenFile.call(this, fileId);
    setTimeout(() => UI.renderOutline(), 0);
    return result;
  };
  const originalEditorGetModel = Editor.getModel;
  Editor.getModel = function (file) {
    const model = originalEditorGetModel.call(this, file);
    if (model && !model._jspUpgradeOutlineListener) {
      model._jspUpgradeOutlineListener = model.onDidChangeContent(() => Utils.debounce(() => UI.renderOutline(), 120)());
    }
    return model;
  };

  const originalApplySettings = Editor.applySettings;
  Editor.applySettings = function () {
    originalApplySettings.call(this);
    const s = State.settings;
    if (this.editor && this.editor.updateOptions) {
      this.editor.updateOptions({
        fontFamily: s.fontFamily || 'JetBrains Mono',
        fontLigatures: s.ligatures !== false,
        lineNumbers: s.lineNumbers === false ? 'off' : 'on'
      });
    }
    if (this.monaco && this.monaco.editor) {
      this.monaco.editor.setTheme(s.theme === 'light' ? 'jsp-light' : s.theme === 'contrast' ? 'jsp-contrast' : 'jsp-dark');
    }
  };

  // Add a first-class Monaco action and context-menu entry.
  const originalRefreshActions = Editor.refreshActions;
  Editor.refreshActions = function () {
    if (this._upgradeSelectionAction) { try { this._upgradeSelectionAction.dispose(); } catch (_) {} this._upgradeSelectionAction = null; }
    return originalRefreshActions.call(this);
  };
  const originalRegisterActions = Editor._registerActions;
  Editor._registerActions = function () {
    originalRegisterActions.call(this);
    if (!this.editor || !this.monaco || this._upgradeSelectionAction) return;
    const chord = KeyBindings && KeyBindings.chordFor('runSelection');
    const keybinding = chord && this._chordToMonaco ? this._chordToMonaco(chord) : null;
    const options = {
      id: 'jsp.run-selection',
      label: 'Run Selection',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1,
      run: () => Commands.runSelection('editor')
    };
    if (keybinding) options.keybindings = [keybinding];
    this._upgradeSelectionAction = this.editor.addAction(options);
  };

  /* ------------------------------------------------------------------
   * Filesystem additions: duplicate, safe moves, and drag/drop.
   * ------------------------------------------------------------------ */
  Filesystem.duplicate = function (nodeId, parentId) {
    const node = State.findNode(nodeId);
    if (!node || node.id === 'root') return null;
    const parent = State.findNode(parentId || (State.findParent(nodeId) || State.project).id);
    if (!parent || parent.type !== 'folder') return null;
    const copy = cloneNode(node, parent);
    parent.children = parent.children || [];
    parent.children.push(copy);
    parent.expanded = true;
    State.indexFiles();
    return copy;
  };

  function cloneNode(node, parent) {
    const names = Filesystem.siblingNames(parent);
    const name = Utils.uniqueName(node.name.replace(/(\.js)$/i, ' copy$1'), names);
    if (node.type === 'file') {
      return { id: Utils.uid('file'), type: 'file', name, language: 'javascript', content: node.content || '', savedContent: node.content || '' };
    }
    const folder = { id: Utils.uid('folder'), type: 'folder', name: Utils.uniqueName(node.name + ' copy', names), expanded: true, children: [] };
    (node.children || []).forEach((child) => folder.children.push(cloneNode(child, folder)));
    return folder;
  }

  Filesystem.move = function (nodeId, targetFolderId) {
    const node = State.findNode(nodeId);
    const target = State.findNode(targetFolderId);
    if (!node || !target || node.id === 'root' || target.type !== 'folder' || node.id === target.id) return { ok: false, error: 'Invalid move.' };
    if (node.type === 'folder' && isDescendant(target, node.id)) return { ok: false, error: 'A folder cannot be moved inside itself.' };
    const existing = (target.children || []).find((child) => child.id !== node.id && child.name.toLowerCase() === node.name.toLowerCase());
    if (existing) return { ok: false, error: 'A file or folder with that name already exists here.' };
    const source = State.findParent(nodeId);
    if (!source || source.id === target.id) return { ok: false, error: 'Item is already in that folder.' };
    source.children = (source.children || []).filter((child) => child.id !== node.id);
    target.children = target.children || [];
    target.children.push(node);
    target.expanded = true;
    State.indexFiles();
    return { ok: true };
  };

  function isDescendant(folder, id) {
    return (folder.children || []).some((child) => child.id === id || (child.type === 'folder' && isDescendant(child, id)));
  }

  const originalRenderNode = UI._renderNode;
  UI._renderNode = function (node, depth) {
    const item = originalRenderNode.call(this, node, depth);
    const row = item && item.querySelector ? item.querySelector(':scope > .tree-row') : null;
    if (row && node.id !== 'root') {
      row.draggable = true;
      row.addEventListener('dragstart', (event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', node.id);
      });
      row.addEventListener('dragover', (event) => {
        if (node.type !== 'folder') return;
        event.preventDefault();
        row.classList.add('drag-over');
        event.dataTransfer.dropEffect = 'move';
      });
      row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
      row.addEventListener('drop', (event) => {
        if (node.type !== 'folder') return;
        event.preventDefault();
        row.classList.remove('drag-over');
        const sourceId = event.dataTransfer.getData('text/plain');
        const result = Filesystem.move(sourceId, node.id);
        if (!result.ok) UI.toast(result.error, 'warn');
        else { UI.renderFileTree(); UI.updateBreadcrumb(); Commands.persistProject(); UI.toast('Moved', 'success'); }
      });
    }
    return item;
  };

  function setupDragAndDrop() {
    const tree = UI.dom.fileTree;
    if (!tree) return;
    tree.addEventListener('dragend', () => tree.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over')));
  }

  function setupTouchPanelResize() {
    const horizontal = UI.dom.resizeH;
    if (!horizontal || horizontal._touchUpgradeBound) return;
    horizontal._touchUpgradeBound = true;
    let startY = 0;
    horizontal.addEventListener('touchstart', (event) => { startY = event.touches[0].clientY; }, { passive: true });
    horizontal.addEventListener('touchmove', (event) => {
      if (!event.touches[0]) return;
      event.preventDefault();
      const delta = startY - event.touches[0].clientY;
      const next = clamp((State.settings.panelHeight || 280) + delta, 120, window.innerHeight * .6);
      State.settings.panelHeight = next;
      if (State.settings.panelPosition === 'bottom') document.documentElement.style.setProperty('--panel-size', next + 'px');
      startY = event.touches[0].clientY;
      if (Editor.editor && Editor.editor.layout) Editor.editor.layout();
    }, { passive: false });
    horizontal.addEventListener('touchend', () => Commands.persistSettings(), { passive: true });
  }

  function setupExplorerResize() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar || sidebar.querySelector('.sidebar-resize-handle')) return;
    const handle = document.createElement('div');
    handle.className = 'sidebar-resize-handle';
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-label', 'Resize Explorer');
    handle.tabIndex = 0;
    sidebar.appendChild(handle);
    const setWidth = (width) => {
      const value = clamp(width, 200, 400);
      State.settings.explorerWidth = value;
      document.documentElement.style.setProperty('--sidebar-width', value + 'px');
      if (Editor.editor && Editor.editor.layout) Editor.editor.layout();
    };
    let startX = 0;
    let startWidth = 0;
    const move = (event) => setWidth(startWidth + event.clientX - startX);
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      Commands.persistSettings();
    };
    handle.addEventListener('pointerdown', (event) => {
      startX = event.clientX;
      startWidth = sidebar.getBoundingClientRect().width;
      handle.setPointerCapture && handle.setPointerCapture(event.pointerId);
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
      event.preventDefault();
    });
    handle.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      setWidth((State.settings.explorerWidth || 252) + (event.key === 'ArrowRight' ? 12 : -12));
      Commands.persistSettings();
    });
    document.documentElement.style.setProperty('--sidebar-width', (State.settings.explorerWidth || 252) + 'px');
  }

  /* ------------------------------------------------------------------
   * Commands and keybindings
   * ------------------------------------------------------------------ */
  Commands.runSelection = function () {
    if (Execution.isRunning()) { UI.toast('Stop the current run before starting another.', 'warn'); return; }
    const selection = Editor.getSelectedText();
    if (!selection.trim()) {
      UI.toast('Select JavaScript code first, then run the selection.', 'warn');
      UI.switchConsoleTab('console');
      return;
    }
    UI.switchConsoleTab('console');
    Execution.run(selection, { selection: true });
  };

  const originalCommandsRun = Commands.run;
  Commands.run = function (source) {
    const result = originalCommandsRun.call(this, source);
    // The legacy method uses "output" as the console tab name.
    UI.switchConsoleTab('console');
    return result;
  };

  Commands.saveFile = function (fileId) {
    const file = State.files.get(fileId);
    if (!file) return Promise.resolve();
    if (file.id === State.activeFileId && Editor.editor && Editor.editor.getModel) {
      const model = Editor.editor.getModel(); if (model) file.content = model.getValue();
    }
    State.markSaved(file.id);
    return Promise.all([Commands.persistProject(), Commands.persistState()]).then(() => { UI.renderTabs(); UI.updateSaveStatus('saved'); UI.appendOutput('File saved', 'success'); });
  };

  const originalResetProjectCommand = Commands.resetProject;
  Commands.resetProject = async function () {
    const result = await originalResetProjectCommand.call(this);
    State.diagnostics = [];
    if (Editor._updateProblems) Editor._updateProblems();
    UI.appendOutput('Project reset', 'success');
    return result;
  };

  const originalSaveCommand = Commands.save;
  Commands.save = function () {
    const result = originalSaveCommand.call(this);
    Promise.resolve(result).then(() => UI.appendOutput('File saved', 'success'));
    return result;
  };
  const originalNewFileCommand = Commands.newFile;
  Commands.newFile = function () { const result = originalNewFileCommand.apply(this, arguments); UI.appendOutput('File created', 'success'); return result; };
  const originalNewFolderCommand = Commands.newFolder;
  Commands.newFolder = function () { const result = originalNewFolderCommand.apply(this, arguments); UI.appendOutput('Folder created', 'success'); return result; };

  Commands.saveAll = function () {
    if (Editor.editor && State.activeFileId) {
      const model = Editor.editor.getModel && Editor.editor.getModel();
      if (model) { const file = State.files.get(State.activeFileId); if (file) file.content = model.getValue(); }
    }
    State.markAllSaved();
    UI.updateSaveStatus('saving');
    return Promise.all([Commands.persistProject(), Commands.persistState()]).then(() => {
      UI.updateSaveStatus('saved');
      UI.renderTabs();
      UI.appendOutput('All files saved', 'success');
      UI.toast('All files saved', 'success');
    });
  };

  Commands.duplicateFile = function (nodeId) {
    const node = State.findNode(nodeId || State.activeFileId);
    if (!node || node.type !== 'file') { UI.toast('Select a file to duplicate.', 'warn'); return; }
    const copy = Filesystem.duplicate(node.id);
    if (!copy) return;
    UI.renderFileTree();
    UI.renderTabs();
    Commands.persistProject();
    Editor.openFile(copy.id);
    UI.toast('Duplicated ' + node.name, 'success');
  };

  Commands.closeOthers = async function (fileId) {
    const keep = fileId || State.activeFileId;
    for (const id of State.openTabs.slice()) if (id !== keep) await Commands.closeFile(id);
  };
  Commands.closeAll = async function () {
    for (const id of State.openTabs.slice()) await Commands.closeFile(id);
  };

  const originalTogglePanel = Commands.togglePanel;
  Commands.togglePanel = function () {
    const visible = originalTogglePanel.call(this);
    if (UI.dom.btnConsoleToggle) UI.dom.btnConsoleToggle.setAttribute('aria-expanded', visible ? 'true' : 'false');
    return visible;
  };

  Commands.resetLayout = function () {
    State.settings.explorerWidth = DEFAULT_LAYOUT.explorerWidth;
    State.settings.panelHeight = DEFAULT_LAYOUT.panelHeight;
    State.settings.panelWidth = DEFAULT_LAYOUT.panelWidth;
    State.settings.panelPosition = 'bottom';
    document.documentElement.style.setProperty('--sidebar-width', DEFAULT_LAYOUT.explorerWidth + 'px');
    Commands.setPanelPosition('bottom');
    UI.dom.workspace.classList.remove('console-hidden');
    document.documentElement.style.setProperty('--panel-size', DEFAULT_LAYOUT.panelHeight + 'px');
    Commands.persistSettings();
    if (Editor.editor && Editor.editor.layout) Editor.editor.layout();
    UI.toast('Layout reset', 'success');
  };

  Commands.setTheme = function (theme) {
    if (!['dark', 'light', 'contrast'].includes(theme)) return;
    State.settings.theme = theme;
    UI.applyTheme();
    Commands.persistSettings();
  };
  Commands.toggleTheme = function () {
    const order = ['dark', 'light', 'contrast'];
    const next = order[(order.indexOf(State.settings.theme) + 1) % order.length];
    Commands.setTheme(next);
    UI.toast('Theme: ' + (next === 'contrast' ? 'High Contrast' : next), 'success');
  };

  const originalSetPanelPosition = Commands.setPanelPosition;
  Commands.setPanelPosition = function (position) {
    if (position === 'hidden') {
      State.settings.panelPosition = 'hidden';
      UI.dom.workspace.classList.add('console-hidden');
      if (UI.dom.setPanelPosition) UI.dom.setPanelPosition.value = 'hidden';
      Commands.persistSettings();
      if (Editor.editor && Editor.editor.layout) setTimeout(() => Editor.editor.layout(), 20);
      return;
    }
    if (position === 'right' || position === 'bottom') {
      originalSetPanelPosition.call(this, position);
      State.settings.panelPosition = position;
    }
  };

  const originalCommandsList = Commands.list;
  Commands.list = function () {
    const list = originalCommandsList.call(this);
    const extra = [
      { label: 'Run File', category: 'Execution', run: () => Commands.run('palette') },
      { label: 'Run Selection', category: 'Execution', run: () => Commands.runSelection('palette') },
      { label: 'Save All', category: 'File', run: () => Commands.saveAll() },
      { label: 'Duplicate File', category: 'File', run: () => Commands.duplicateFile() },
      { label: 'Close Others', category: 'File', run: () => Commands.closeOthers() },
      { label: 'Close All Files', category: 'File', run: () => Commands.closeAll() },
      { label: 'Search Project', category: 'Navigation', run: () => UI.openProjectSearch() },
      { label: 'Toggle Explorer', category: 'View', run: () => Commands.toggleSidebar() },
      { label: 'Toggle Console', category: 'View', run: () => Commands.togglePanel() },
      { label: 'Toggle Problems', category: 'View', run: () => UI.switchConsoleTab('problems') },
      { label: 'Toggle Preview', category: 'View', run: () => UI.switchConsoleTab('preview') },
      { label: 'Toggle Output', category: 'View', run: () => UI.switchConsoleTab('output') },
      { label: 'Reset Layout', category: 'View', run: () => Commands.resetLayout() },
      { label: 'Open Keyboard Shortcuts', category: 'Help', run: () => { UI.openSettings(); UI.openSettingsTab('shortcuts'); } },
      { label: 'Practice JavaScript', category: 'Learn', run: () => UI.openPractice() },
      { label: 'Clear History', category: 'Learn', run: () => { State.runHistory = []; persistHistory(); UI.renderHistory(); } }
    ];
    return list.concat(extra);
  };

  if (KeyBindings && !KeyBindings.BINDABLE.some((entry) => entry.id === 'runSelection')) {
    KeyBindings.BINDABLE.push({ id: 'runSelection', label: 'Run Selection', category: 'Execution', defaults: { windows: 'ctrl+shift+enter', mac: 'meta+shift+enter' } });
    KeyBindings.BINDABLE.push({ id: 'searchProject', label: 'Search Project', category: 'Navigation', defaults: { windows: 'ctrl+shift+f', mac: 'meta+shift+f' } });
    KeyBindings.BINDABLE.push({ id: 'saveAll', label: 'Save All', category: 'File', defaults: { windows: 'ctrl+alt+s', mac: 'meta+alt+s' } });
    const originalMatchAction = JSP.Shortcuts._handleAction;
    JSP.Shortcuts._handleAction = function (actionId, event) {
      if (actionId === 'runSelection') { Commands.runSelection('shortcut'); return true; }
      if (actionId === 'searchProject') { UI.openProjectSearch(); return true; }
      if (actionId === 'saveAll') { Commands.saveAll(); return true; }
      return originalMatchAction.call(this, actionId, event);
    };
  }

  // Monaco already owns these keybindings inside its editor textarea. Letting
  // the document listener fire as well would turn a run into run-then-stop.
  const originalShortcutOnKeyDown = JSP.Shortcuts.onKeyDown;
  JSP.Shortcuts.onKeyDown = function (event) {
    const inMonaco = event.target && event.target.closest && event.target.closest('.monaco-editor');
    if (inMonaco && (event.ctrlKey || event.metaKey) && event.key === 'Enter') return;
    return originalShortcutOnKeyDown.call(this, event);
  };

  // Commands that use the tab/context menus all call safe APIs.
  const originalHandleContext = UI._handleContextAction;
  UI._handleContextAction = function (action, nodeId) {
    if (action === 'duplicate') return Commands.duplicateFile(nodeId);
    if (action === 'closeOthers') return Commands.closeOthers(nodeId);
    if (action === 'closeAll') return Commands.closeAll();
    if (action === 'save') return Commands.saveFile(nodeId);
    if (action === 'open') return openOrFocusFile(nodeId);
    return originalHandleContext.call(this, action, nodeId);
  };

  const originalShowContext = UI.showContextMenuFor;
  UI.showContextMenuFor = function (nodeId, x, y) {
    const node = State.findNode(nodeId);
    if (!node || node.type !== 'file') return originalShowContext.call(this, nodeId, x, y);
    this._ctxTarget = nodeId;
    const menu = this.dom.contextMenu;
    menu.textContent = '';
    const items = [
      ['Open', 'open'], ['Save', 'save'], ['Duplicate', 'duplicate'], ['Rename', 'rename'], ['Download', 'download'],
      ['-', null], ['Close', 'close'], ['Close Others', 'closeOthers'], ['Close All', 'closeAll'],
      ['-', null], ['Delete', 'delete']
    ];
    items.forEach(([label, action]) => {
      if (label === '-') { const sep = document.createElement('li'); sep.className = 'ctx-separator'; menu.appendChild(sep); return; }
      const li = document.createElement('li');
      li.setAttribute('role', 'menuitem'); li.tabIndex = 0;
      li.textContent = label;
      if (action === 'delete') li.style.color = 'var(--danger)';
      li.addEventListener('click', () => { this.hideContextMenu(); if (action === 'close') Commands.closeFile(nodeId); else this._handleContextAction(action, nodeId); });
      li.addEventListener('keydown', (event) => { if (event.key === 'Enter') li.click(); });
      menu.appendChild(li);
    });
    menu.hidden = false;
    const rect = menu.getBoundingClientRect();
    menu.style.left = Math.min(x, window.innerWidth - rect.width - 4) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - rect.height - 4) + 'px';
    const first = menu.querySelector('li:not(.ctx-separator)');
    if (first) first.focus();
  };

  // Menu additions without duplicating the menu renderer.
  const originalGetMenuItems = UI._getMenuItems;
  UI._getMenuItems = function (name) {
    const items = originalGetMenuItems.call(this, name);
    if (name === 'run') {
      if (items[0] && items[0].label) items[0].label = 'Run File';
      items.splice(1, 0, { label: 'Run Selection', shortcut: this._sc('runSelection'), action: () => Commands.runSelection('menu') });
    }
    if (name === 'view') {
      items.push('-', { label: 'Search Project', shortcut: this._sc('searchProject'), action: () => UI.openProjectSearch() }, { label: 'Reset Layout', action: () => Commands.resetLayout() }, { label: 'Toggle Preview', action: () => UI.switchConsoleTab('preview') }, { label: 'Hide Panel', action: () => Commands.setPanelPosition('hidden') });
    }
    if (name === 'file') {
      items.splice(5, 0, { label: 'Save All', shortcut: this._sc('saveAll'), action: () => Commands.saveAll() });
    }
    return items;
  };

  /* ------------------------------------------------------------------
   * Settings and themes
   * ------------------------------------------------------------------ */
  const originalApplyTheme = UI.applyTheme;
  UI.applyTheme = function () {
    originalApplyTheme.call(this);
    document.body.classList.toggle('theme-contrast', State.settings.theme === 'contrast');
    document.body.classList.toggle('theme-dark', State.settings.theme === 'dark');
    document.body.classList.toggle('theme-light', State.settings.theme === 'light');
    if (Editor.monaco && Editor.monaco.editor) Editor.monaco.editor.setTheme(State.settings.theme === 'light' ? 'jsp-light' : State.settings.theme === 'contrast' ? 'jsp-contrast' : 'jsp-dark');
  };

  const originalOpenSettings = UI.openSettings;
  UI.openSettings = function () {
    originalOpenSettings.call(this);
    const s = State.settings;
    if (this.dom.setFontFamily) this.dom.setFontFamily.value = s.fontFamily || 'JetBrains Mono';
    if (this.dom.setLigatures) this.dom.setLigatures.checked = s.ligatures !== false;
    if (this.dom.setLineNumbers) this.dom.setLineNumbers.checked = s.lineNumbers !== false;
    if (this.dom.setConfirmClose) this.dom.setConfirmClose.checked = s.confirmClose !== false;
    if (this.dom.setRestoreTabs) this.dom.setRestoreTabs.checked = s.restoreTabs !== false;
  };

  function bindExtraSettings() {
    const d = UI.dom;
    if (d.setFontFamily) d.setFontFamily.addEventListener('change', (event) => { State.settings.fontFamily = event.target.value; Editor.applySettings(); Commands.persistSettings(); });
    if (d.setLigatures) d.setLigatures.addEventListener('change', (event) => { State.settings.ligatures = event.target.checked; Editor.applySettings(); Commands.persistSettings(); });
    if (d.setLineNumbers) d.setLineNumbers.addEventListener('change', (event) => { State.settings.lineNumbers = event.target.checked; Editor.applySettings(); Commands.persistSettings(); });
    if (d.setConfirmClose) d.setConfirmClose.addEventListener('change', (event) => { State.settings.confirmClose = event.target.checked; Commands.persistSettings(); });
    if (d.setRestoreTabs) d.setRestoreTabs.addEventListener('change', (event) => { State.settings.restoreTabs = event.target.checked; Commands.persistSettings(); });
  }

  // Add the contrast Monaco theme after the original initializer has loaded.
  const beforeEditorInit = Editor.init;
  Editor.init = async function (container) {
    const result = await beforeEditorInit.call(this, container);
    if (this.monaco && this.monaco.editor && !this._contrastThemeDefined) {
      this.monaco.editor.defineTheme('jsp-contrast', {
        base: 'hc-black', inherit: true, rules: [], colors: {
          'editor.background': '#000000', 'editor.foreground': '#ffffff', 'editorLineNumber.foreground': '#ffffff',
          'editorLineNumber.activeForeground': '#ffdf00', 'editorCursor.foreground': '#ffdf00',
          'editor.selectionBackground': '#005a94', 'editor.lineHighlightBackground': '#171717',
          'editorWidget.background': '#050505', 'editorWidget.border': '#ffffff'
        }
      });
      this._contrastThemeDefined = true;
    }
    this.applySettings();
    return result;
  };

  /* ------------------------------------------------------------------
   * Quick Open, global search, practice, preview, run history
   * ------------------------------------------------------------------ */
  UI.openProjectSearch = function () {
    this.closeAllOverlays();
    if (!this.dom.projectSearchOverlay) return;
    this.dom.projectSearchOverlay.hidden = false;
    this.dom.projectSearchInput.value = '';
    this.renderProjectSearch();
    setTimeout(() => this.dom.projectSearchInput.focus(), 0);
  };
  UI.closeProjectSearch = function () {
    if (this.dom.projectSearchOverlay) this.dom.projectSearchOverlay.hidden = true;
    if (Editor.editor) Editor.focus();
  };
  UI.renderProjectSearch = function () {
    const input = this.dom.projectSearchInput;
    const list = this.dom.projectSearchResults;
    if (!input || !list) return;
    const query = input.value;
    list.textContent = '';
    if (!query) {
      const empty = document.createElement('li'); empty.className = 'quick-open-empty'; empty.textContent = 'Type to search across the project.'; list.appendChild(empty); return;
    }
    const flags = this.dom.searchCaseSensitive && this.dom.searchCaseSensitive.checked ? 'g' : 'gi';
    const needle = this.dom.searchWholeWord && this.dom.searchWholeWord.checked ? '\\b' + escapeRegExp(query) + '\\b' : escapeRegExp(query);
    let regex;
    try { regex = new RegExp(needle, flags); } catch (_) { return; }
    const results = [];
    Filesystem.listFiles().forEach((file) => {
      const lines = (file.node.content || '').split('\n');
      lines.forEach((line, index) => {
        regex.lastIndex = 0;
        let match;
        while ((match = regex.exec(line)) && results.length < 250) {
          results.push({ fileId: file.id, path: file.path, line: index + 1, column: match.index + 1, text: line.trim() });
          if (!regex.global) break;
          if (match[0] === '') regex.lastIndex++;
        }
      });
    });
    if (!results.length) { const empty = document.createElement('li'); empty.className = 'quick-open-empty'; empty.textContent = 'No matches.'; list.appendChild(empty); return; }
    results.forEach((result) => {
      const li = document.createElement('li'); li.setAttribute('role', 'option');
      const icon = document.createElement('span'); icon.textContent = '⌕';
      const copy = document.createElement('span'); copy.className = 'search-result-copy';
      const file = document.createElement('span'); file.className = 'search-result-file'; file.textContent = result.path + ':' + result.line;
      const line = document.createElement('span'); line.className = 'search-result-line'; line.textContent = result.text;
      copy.append(file, line); li.append(icon, copy);
      li.addEventListener('click', () => { UI.closeProjectSearch(); openOrFocusFile(result.fileId, result.line, result.column, result.column + query.length); });
      list.appendChild(li);
    });
  };

  function escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  const PRACTICE = [
    { title: 'Reverse an Array', prompt: 'Write a function that returns an array in reverse order without changing the original array.', input: '[1, 2, 3, 4]', expected: '[4, 3, 2, 1]', starter: 'function reverseArray(values) {\n  // Return a reversed copy of values.\n}\n\nconsole.log(reverseArray([1, 2, 3, 4]));\n' },
    { title: 'Count Vowels', prompt: 'Return how many vowels appear in a string.', input: '"JavaScript"', expected: '3', starter: 'function countVowels(text) {\n  // Count a, e, i, o, and u.\n}\n\nconsole.log(countVowels("JavaScript"));\n' },
    { title: 'Sum Positive Numbers', prompt: 'Return the sum of only the positive numbers in an array.', input: '[-2, 5, 3, -1]', expected: '8', starter: 'function sumPositive(values) {\n  // Add values greater than zero.\n}\n\nconsole.log(sumPositive([-2, 5, 3, -1]));\n' }
  ];
  let practiceIndex = 0;
  UI.openPractice = function () {
    const dlg = this.dom.practiceDialog;
    if (!dlg) return;
    this.renderPractice();
    const closeButtons = dlg.querySelectorAll('[data-action="close"]');
    closeButtons.forEach((button) => button.onclick = () => { try { dlg.close(); } catch (_) { dlg.hidden = true; } });
    const open = dlg.querySelector('[data-action="open"]');
    if (open) open.onclick = () => { Commands.openPracticeExercise(PRACTICE[practiceIndex]); try { dlg.close(); } catch (_) { dlg.hidden = true; } };
    if (typeof dlg.showModal === 'function') { if (!dlg.open) dlg.showModal(); } else dlg.hidden = false;
  };
  UI.renderPractice = function () {
    const item = PRACTICE[practiceIndex];
    const content = this.dom.practiceContent;
    if (!content) return;
    content.textContent = '';
    const picker = document.createElement('div'); picker.className = 'practice-picker';
    PRACTICE.forEach((exercise, index) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'modal-btn ' + (index === practiceIndex ? 'primary' : ''); button.textContent = exercise.title;
      button.onclick = () => { practiceIndex = index; this.renderPractice(); this.openPractice(); };
      picker.appendChild(button);
    });
    const copy = document.createElement('p'); copy.className = 'practice-copy'; copy.textContent = item.prompt;
    const input = document.createElement('div'); input.className = 'practice-example'; input.textContent = 'Input:    ' + item.input + '\nExpected: ' + item.expected;
    content.append(picker, copy, input);
  };
  Commands.openPracticeExercise = function (exercise) {
    let folder = Array.from(State.project.children || []).find((node) => node.type === 'folder' && node.name === 'practice');
    if (!folder) folder = Filesystem.createFolder('root', 'practice');
    const file = Filesystem.createFile(folder.id, Utils.uniqueName(exercise.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.js', Filesystem.siblingNames(folder)));
    file.content = exercise.starter;
    file.savedContent = exercise.starter;
    UI.renderFileTree(); UI.renderTabs(); Commands.persistProject(); Editor.openFile(file.id);
    UI.toast('Practice exercise opened', 'success');
  };

  UI.requestInput = function (message, defaultValue) {
    const dialog = this.dom.inputDialog;
    if (!dialog || !this.dom.inputValue) return Promise.resolve(null);
    this.dom.inputMessage.textContent = message || 'Your program is asking for input.';
    this.dom.inputValue.value = defaultValue || '';
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        submit.removeEventListener('click', submitHandler);
        cancel.removeEventListener('click', cancelHandler);
        this.dom.inputValue.removeEventListener('keydown', keyHandler);
        try { dialog.close(); } catch (_) { dialog.hidden = true; }
        if (this._inputCancel === cancelInput) this._inputCancel = null;
        resolve(value);
        if (Editor.editor) setTimeout(() => Editor.focus(), 0);
      };
      const cancelInput = () => finish(null);
      this._inputCancel = cancelInput;
      const submit = dialog.querySelector('[data-action="submit"]');
      const cancel = dialog.querySelector('[data-action="cancel"]');
      const submitHandler = () => finish(this.dom.inputValue.value);
      const cancelHandler = () => finish(null);
      const keyHandler = (event) => {
        if (event.key === 'Enter') { event.preventDefault(); submitHandler(); }
        else if (event.key === 'Escape') { event.preventDefault(); cancelHandler(); }
      };
      submit.addEventListener('click', submitHandler);
      cancel.addEventListener('click', cancelHandler);
      this.dom.inputValue.addEventListener('keydown', keyHandler);
      if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); } else dialog.hidden = false;
      setTimeout(() => { this.dom.inputValue.focus(); this.dom.inputValue.select(); }, 0);
    });
  };

  UI.cancelInput = function () { if (this._inputCancel) this._inputCancel(); };

  UI.refreshPreview = function () {
    const frame = this.dom.previewFrame;
    if (!frame) return;
    const source = activeSource();
    const escaped = source.replace(/<\/script/gi, '<\\/script');
    frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><style>body{font:16px system-ui;color:#18212b;padding:20px}button{padding:8px 12px}</style></head><body><script>' + escaped + '<\/script></body></html>';
  };
  UI.clearPreview = function () { if (this.dom.previewFrame) this.dom.previewFrame.srcdoc = '<!doctype html><html><body></body></html>'; };
  UI.openPreviewWindow = function () {
    const source = activeSource().replace(/<\/script/gi, '<\\/script');
    const blob = new Blob(['<!doctype html><html><body><script>' + source + '<\/script></body></html>'], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = global.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    if (!win) this.toast('Allow pop-ups to open the preview.', 'warn');
  };

  function persistHistory() {
    State.runHistory = (State.runHistory || []).slice(0, MAX_HISTORY);
    JSP.Storage.set(HISTORY_KEY, State.runHistory);
  }
  UI.renderHistory = function () {
    const list = this.dom.historyList;
    if (!list) return;
    list.textContent = '';
    const history = State.runHistory || [];
    if (!history.length) { const empty = document.createElement('p'); empty.className = 'sidebar-empty'; empty.textContent = 'No runs yet.'; list.appendChild(empty); return; }
    history.slice(0, 12).forEach((entry) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'history-item'; button.title = 'Show output from ' + filePath(entry.fileId);
      const time = document.createElement('span'); time.className = 'history-time'; time.textContent = nowLabel(entry.timestamp);
      const status = document.createElement('span'); status.className = 'history-status ' + (entry.status === 'done' ? 'ok' : 'err'); status.textContent = entry.status === 'done' ? '✓' : '✕';
      const file = document.createElement('span'); file.className = 'history-file'; file.textContent = entry.filePath || filePath(entry.fileId);
      button.append(time, status, file);
      button.onclick = () => {
        if (entry.fileId && State.files.has(entry.fileId)) openOrFocusFile(entry.fileId);
        UI.switchConsoleTab('console');
        if (entry.output) { UI.clearConsole(); UI.appendConsole('result', [entry.output]); }
        else UI.toast('Run selected', 'success');
      };
      list.appendChild(button);
    });
  };

  function recordHistory(status, duration) {
    const entry = {
      id: Utils.uid('run'), timestamp: Date.now(), fileId: State.activeFileId,
      filePath: State.activeFileId ? filePath(State.activeFileId) : 'selection',
      status: status === 'done' && !State._activeRunHadError ? 'done' : 'error',
      duration: Number(duration) || 0,
      output: (State._activeRunOutput || []).join('\n').slice(0, 4000)
    };
    State.runHistory = [entry].concat(State.runHistory || []).slice(0, MAX_HISTORY);
    persistHistory();
    UI.renderHistory();
    State._activeRunOutput = [];
    State._activeRunHadError = false;
  }

  const originalExecutionRun = Execution.run;
  Execution.run = function (source, meta) {
    State._activeRunOutput = [];
    State._activeRunHadError = false;
    this._upgradeRunMeta = meta || {};
    const result = originalExecutionRun.call(this, source);
    return result;
  };
  const originalExecutionFinish = Execution._finishRun;
  Execution._finishRun = function (duration, aborted) {
    const result = originalExecutionFinish.call(this, duration, aborted);
    recordHistory(aborted ? 'error' : 'done', duration);
    return result;
  };
  const originalExecutionStop = Execution.stop;
  Execution.stop = function (reason) {
    const wasRunning = State.running;
    const result = originalExecutionStop.call(this, reason);
    if (wasRunning && reason) recordHistory('error', (global.performance && global.performance.now ? global.performance.now() - this._startTime : 0));
    return result;
  };

  const originalLoadState = Commands.loadFromStorage;
  Commands.loadFromStorage = async function () {
    await originalLoadState.call(this);
    if (State.settings.restoreTabs === false) {
      const main = State.findFileByName('main.js') || State.files.values().next().value;
      State.openTabs = main ? [main.id] : [];
      State.activeFileId = main ? main.id : null;
    }
    const history = await JSP.Storage.get(HISTORY_KEY);
    const output = await JSP.Storage.get(OUTPUT_KEY);
    if (Array.isArray(history)) State.runHistory = history.slice(0, MAX_HISTORY);
    if (Array.isArray(output)) State.outputMessages = output.slice(-200);
    UI.renderHistory();
    UI.renderOutput();
    UI.appendOutput('Project restored', 'system');
  };

  // Persist history and output along with the existing state metadata.
  const originalPersistState = Commands.persistState;
  Commands.persistState = function () {
    persistHistory();
    JSP.Storage.set(OUTPUT_KEY, (State.outputMessages || []).slice(-200));
    return originalPersistState.call(this);
  };

  // Initialize cached visual state once the app's normal boot reaches UI.init.
  const originalBootReadyRender = UI.renderFileTree;
  UI.renderFileTree = function () {
    const result = originalBootReadyRender.call(this);
    if (this._upgradeBound) this.renderOutline();
    return result;
  };
  const originalRenderTabsUpgrade = UI.renderTabs;
  UI.renderTabs = function () {
    const result = originalRenderTabsUpgrade.call(this);
    if (this.dom && this.dom.tabs) {
      this.dom.tabs.querySelectorAll('.tab[data-id]').forEach((tab) => {
        const file = State.files.get(tab.dataset.id);
        if (file) tab.title = filePath(file.id);
      });
    }
    return result;
  };

  function updateShortcutHints() {
    if (!KeyBindings) return;
    const set = (id, action) => { const el = document.getElementById(id); const chord = KeyBindings.chordFor(action); if (el && chord) el.textContent = KeyBindings.pretty(chord); };
    set('kbd-quick-open', 'quickOpen'); set('kbd-command-palette', 'commandPalette'); set('kbd-run', 'run');
  }

  // Upgrade the old close prompt to respect the setting and fix the old
  // listener cleanup bug (each button now removes its own handler).
  UI.unsavedChangesPrompt = function (fileName) {
    return new Promise((resolve) => {
      const dialog = this.dom.unsavedDialog;
      const buttons = Array.from(dialog.querySelectorAll('button[data-action]'));
      const finish = (value) => {
        buttons.forEach((button) => button.removeEventListener('click', handlers.get(button)));
        try { dialog.close(); } catch (_) { dialog.hidden = true; }
        resolve(value);
      };
      const handlers = new Map();
      this.dom.unsavedMessage.textContent = '"' + fileName + '" has unsaved changes.\n\nSave before closing?';
      buttons.forEach((button) => { const handler = () => finish(button.dataset.action); handlers.set(button, handler); button.addEventListener('click', handler); });
      if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); } else dialog.hidden = false;
      const save = dialog.querySelector('[data-action="save"]'); if (save) save.focus();
    });
  };
  const originalCloseFile = Commands.closeFile;
  Commands.closeFile = async function (fileId) {
    if (!State.settings.confirmClose) {
      const file = State.files.get(fileId);
      if (file && State.isDirty(fileId)) State.markSaved(fileId);
    }
    return originalCloseFile.call(this, fileId);
  };

  // Expose a small diagnostics/testing surface for static-host smoke tests.
  JSP.Upgrade = { PRACTICE, renderValue, renderTable, persistHistory };

})(window);
