/* ============ ui.js ============ */
(function (global) {
  'use strict';

  const JSP = global.JSP || (global.JSP = {});
  const { Utils, State, Filesystem, Editor, Execution } = JSP;

  // SVG icons used in the file tree.
  const ICONS = {
    chevronRight: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M5.7 3.3a1 1 0 0 0 0 1.4L9 8l-3.3 3.3a1 1 0 1 0 1.4 1.4l4-4a1 1 0 0 0 0-1.4l-4-4a1 1 0 0 0-1.4 0z"/></svg>',
    folder: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h2.8a1.5 1.5 0 0 1 1.1.5l1 1.1h6.1A1.5 1.5 0 0 1 15 5.1v6.4A1.5 1.5 0 0 1 13.5 13h-11A1.5 1.5 0 0 1 1 11.5v-8z" fill="var(--file-folder)"/></svg>',
    folderOpen: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h2.8a1.5 1.5 0 0 1 1.1.5l1 1.1h6.1A1.5 1.5 0 0 1 15 5.1V6H6.6L5 10.3V13H2.5A1.5 1.5 0 0 1 1 11.5v-8z" fill="var(--file-folder-open)"/></svg>',
    jsFile: '<svg viewBox="0 0 16 16"><path fill="#f7df1e" d="M3 1a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V5l-4-4H3z"/><path fill="#1e1e1e" d="M7 12V8h1.1v3.2h1.7V12H7zm3.6 0v-.4c-.4 0-.7 0-1 .1V9.8H9V12h1.6z"/></svg>'
  };

  const UI = {
    _activeMenu: null,
    _ctxTarget: null,

    init() {
      this.cacheDom();
      // Bind Run first so a later init error can never leave the button dead.
      try { this.bindHeaderActions(); } catch (e) { console.error('bindHeaderActions failed', e); }
      try { this.bindGlobalEvents(); } catch (e) { console.error('bindGlobalEvents failed', e); }
      try { this.bindSidebarActions(); } catch (e) { console.error('bindSidebarActions failed', e); }
      try { this.bindConsoleActions(); } catch (e) { console.error('bindConsoleActions failed', e); }
      try { this.bindSettings(); } catch (e) { console.error('bindSettings failed', e); }
      try { this.bindOverlays(); } catch (e) { console.error('bindOverlays failed', e); }
      try { this.applyTheme(); } catch (e) { console.error('applyTheme failed', e); }
      this.updateSaveStatus('ready');
    },

    cacheDom() {
      this.dom = {
        body: document.body,
        fileTree: document.getElementById('file-tree'),
        tabs: document.getElementById('tabs'),
        breadcrumb: document.getElementById('breadcrumb'),
        consoleBody: document.getElementById('console-body'),
        problemsBody: document.getElementById('problems-body'),
        problemsList: document.getElementById('problems-list'),
        contextMenu: document.getElementById('context-menu'),
        menuDropdown: document.getElementById('menu-dropdown'),
        quickOpenOverlay: document.getElementById('quick-open-overlay'),
        quickOpenInput: document.getElementById('quick-open-input'),
        quickOpenResults: document.getElementById('quick-open-results'),
        commandPaletteOverlay: document.getElementById('command-palette-overlay'),
        commandPaletteInput: document.getElementById('command-palette-input'),
        commandPaletteResults: document.getElementById('command-palette-results'),
        settingsOverlay: document.getElementById('settings-overlay'),
        renameDialog: document.getElementById('rename-dialog'),
        renameInput: document.getElementById('rename-input'),
        renameError: document.getElementById('rename-error'),
        confirmDialog: document.getElementById('confirm-dialog'),
        confirmMessage: document.getElementById('confirm-message'),
        confirmActions: document.getElementById('confirm-actions'),
        unsavedDialog: document.getElementById('unsaved-dialog'),
        unsavedMessage: document.getElementById('unsaved-message'),
        statusSave: document.getElementById('status-save'),
        statusExec: document.getElementById('status-exec'),
        statusCursor: document.getElementById('status-cursor'),
        statusIndent: document.getElementById('status-indent'),
        toastContainer: document.getElementById('toast-container'),
        sidebar: document.getElementById('sidebar'),
        main: document.querySelector('.app-main'),
        sidebarOverlay: document.getElementById('sidebar-overlay'),
        consolePanel: document.getElementById('console-panel'),
        btnRun: document.getElementById('btn-run'),
        btnSave: document.getElementById('btn-save'),
        btnTheme: document.getElementById('btn-theme'),
        btnSettings: document.getElementById('btn-settings'),
        btnNewFile: document.getElementById('btn-new-file'),
        btnNewFolder: document.getElementById('btn-new-folder'),
        btnCollapseAll: document.getElementById('btn-collapse-all'),
        btnClearConsole: document.getElementById('btn-clear-console'),
        btnCopyConsole: document.getElementById('btn-copy-console'),
        btnConsoleToggle: document.getElementById('btn-console-toggle'),
        btnDockBottom: document.getElementById('btn-dock-bottom'),
        btnDockRight: document.getElementById('btn-dock-right'),
        workspace: document.getElementById('workspace'),
        resizeH: document.getElementById('console-resize-h'),
        resizeV: document.getElementById('console-resize-v'),
        setPanelPosition: document.getElementById('set-panel-position'),
        setPlatform: document.getElementById('set-platform'),
        settingsTabs: document.querySelectorAll('.settings-tab'),
        settingsBodies: document.querySelectorAll('.settings-body'),
        shortcutSearch: document.getElementById('shortcut-search'),
        shortcutsList: document.getElementById('shortcuts-list'),
        btnResetKeybindings: document.getElementById('btn-reset-keybindings'),
        setTheme: document.getElementById('set-theme'),
        setFontSize: document.getElementById('set-font-size'),
        fontSizeVal: document.getElementById('font-size-val'),
        setTabSize: document.getElementById('set-tab-size'),
        setWordWrap: document.getElementById('set-word-wrap'),
        setMinimap: document.getElementById('set-minimap'),
        setAutosave: document.getElementById('set-autosave'),
        settingsClose: document.getElementById('settings-close'),
        btnResetProject: document.getElementById('btn-reset-project'),
        statusSidebarToggle: document.getElementById('status-sidebar-toggle')
      };
    },

    bindGlobalEvents() {
      // Close menus / context menus on outside click.
      document.addEventListener('click', (e) => {
        if (this._activeMenu && !e.target.closest('.menu-item') && !e.target.closest('.menu-dropdown')) {
          this.closeMenu();
        }
        if (this.dom.contextMenu && !this.dom.contextMenu.hidden && !e.target.closest('.context-menu')) {
          this.hideContextMenu();
        }
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.closeMenu();
          this.hideContextMenu();
          // Close top-most overlay first.
          if (!this.dom.commandPaletteOverlay.hidden) {
            this.dom.commandPaletteOverlay.hidden = true;
            if (Editor.editor) Editor.focus();
          } else if (!this.dom.quickOpenOverlay.hidden) {
            this.dom.quickOpenOverlay.hidden = true;
            if (Editor.editor) Editor.focus();
          } else if (!this.dom.settingsOverlay.hidden) {
            this.closeSettings();
          } else {
            this.closeAllOverlays();
          }
        }
      });
      // Window resize — update minimap setting.
      window.addEventListener('resize', Utils.debounce(() => {
        if (Editor.editor) {
          Editor.editor.updateOptions({
            minimap: { enabled: State.settings.minimap && window.innerWidth > 768 }
          });
        }
      }, 200));

      // Console resize drag handles.
      this._setupConsoleResize();

      // Settings tabs.
      this.dom.settingsTabs && this.dom.settingsTabs.forEach((t) => {
        t.addEventListener('click', () => this.openSettingsTab(t.dataset.tab));
      });

      // Panel-position select.
      if (this.dom.setPanelPosition) {
        this.dom.setPanelPosition.addEventListener('change', (e) => {
          JSP.Commands.setPanelPosition(e.target.value);
        });
      }
      // Platform override.
      if (this.dom.setPlatform) {
        this.dom.setPlatform.value = 'auto';
        this.dom.setPlatform.addEventListener('change', (e) => {
          const v = e.target.value;
          if (v === 'auto') delete globalThis._JSP_PLATFORM_OVERRIDE;
          else globalThis._JSP_PLATFORM_OVERRIDE = v;
          this._renderShortcuts();
          if (JSP.Editor) JSP.Editor.refreshActions && JSP.Editor.refreshActions();
          this._updateKbdHints();
          this.toast('Keyboard layout: ' + (v === 'auto' ? 'auto-detect' : v), 'success');
        });
      }

      // Keyboard shortcuts UI.
      if (this.dom.shortcutSearch) {
        this.dom.shortcutSearch.addEventListener('input', () => this._renderShortcuts());
      }
      if (this.dom.btnResetKeybindings) {
        this.dom.btnResetKeybindings.addEventListener('click', () => {
          if (JSP.KeyBindings) {
            JSP.KeyBindings.resetAll();
            this._renderShortcuts();
            this.toast('Shortcuts reset to defaults', 'success');
          }
        });
      }
    },

    bindHeaderActions() {
      this.dom.btnRun.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        try {
          JSP.Commands.run('button');
        } catch (err) {
          console.error('Run failed', err);
          try { this.appendConsole('error', 'Run failed: ' + (err && err.message ? err.message : err)); } catch (_) {}
        }
      });
      this.dom.btnSave.addEventListener('click', () => JSP.Commands.save());
      this.dom.btnTheme.addEventListener('click', () => JSP.Commands.toggleTheme());
      this.dom.btnSettings.addEventListener('click', () => this.openSettings());
      this.dom.statusSidebarToggle.addEventListener('click', () => JSP.Commands.toggleSidebar());

      // Menu bar.
      document.querySelectorAll('.menu-item').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const menu = btn.dataset.menu;
          if (this._activeMenu === menu) {
            this.closeMenu();
          } else {
            this.openMenu(menu, btn);
          }
        });
      });

      // Theme icon visibility based on current theme.
      this._syncThemeIcons();
    },

    bindSidebarActions() {
      this.dom.btnNewFile.addEventListener('click', () => JSP.Commands.newFile());
      this.dom.btnNewFolder.addEventListener('click', () => JSP.Commands.newFolder());
      this.dom.btnCollapseAll.addEventListener('click', () => {
        Filesystem.collapseAll();
        this.renderFileTree();
      });
      this.dom.sidebarOverlay.addEventListener('click', () => {
        if (window.innerWidth <= 768) JSP.Commands.toggleSidebar(false);
      });
    },

    bindConsoleActions() {
      this.dom.btnClearConsole.addEventListener('click', () => JSP.Commands.clearConsole());
      this.dom.btnCopyConsole.addEventListener('click', () => JSP.Commands.copyConsoleOutput());
      this.dom.btnConsoleToggle.addEventListener('click', () => JSP.Commands.togglePanel());
      const dockBottom = document.getElementById('btn-dock-bottom');
      const dockRight = document.getElementById('btn-dock-right');
      if (dockBottom) dockBottom.addEventListener('click', () => JSP.Commands.setPanelPosition('bottom'));
      if (dockRight) dockRight.addEventListener('click', () => JSP.Commands.setPanelPosition('right'));
      document.querySelectorAll('.console-tab').forEach((t) => {
        t.addEventListener('click', () => this.switchConsoleTab(t.dataset.panel));
      });
    },

    bindSettings() {
      this.dom.settingsClose.addEventListener('click', () => this.closeSettings());
      const aboutBtn = document.getElementById('btn-about');
      if (aboutBtn) aboutBtn.addEventListener('click', () => this.openAbout());
      this.dom.setTheme.addEventListener('change', (e) => {
        JSP.Commands.setTheme(e.target.value);
      });
      this.dom.setFontSize.addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10);
        this.dom.fontSizeVal.textContent = String(v);
        State.settings.fontSize = v;
        if (Editor.editor) Editor.applySettings();
        JSP.Commands.persistSettings();
      });
      this.dom.setTabSize.addEventListener('change', (e) => {
        State.settings.tabSize = parseInt(e.target.value, 10);
        if (Editor.editor) Editor.applySettings();
        this.dom.statusIndent.textContent = 'Spaces: ' + State.settings.tabSize;
        JSP.Commands.persistSettings();
      });
      this.dom.setWordWrap.addEventListener('change', (e) => {
        State.settings.wordWrap = e.target.checked;
        if (Editor.editor) Editor.applySettings();
        JSP.Commands.persistSettings();
      });
      this.dom.setMinimap.addEventListener('change', (e) => {
        State.settings.minimap = e.target.checked;
        if (Editor.editor) Editor.applySettings();
        JSP.Commands.persistSettings();
      });
      this.dom.setAutosave.addEventListener('change', (e) => {
        State.settings.autoSave = e.target.checked;
        JSP.Commands.persistSettings();
        this.toast(e.target.checked ? 'Auto Save enabled' : 'Auto Save disabled', 'success');
      });
      this.dom.btnResetProject.addEventListener('click', () => {
        this.confirm(
          'Reset project?',
          'This will replace all current files with the default examples. This cannot be undone.',
          'Reset',
          () => JSP.Commands.resetProject()
        );
      });
    },

    bindOverlays() {
      // Click outside overlay to close.
      [this.dom.quickOpenOverlay, this.dom.commandPaletteOverlay].forEach((o) => {
        o.addEventListener('mousedown', (e) => {
          if (e.target === o) {
            o.hidden = true;
            if (Editor.editor) Editor.focus();
          }
        });
      });
      this.dom.settingsOverlay.addEventListener('mousedown', (e) => {
        if (e.target === this.dom.settingsOverlay) {
          this.closeSettings();
        }
      });
      this._setupQuickOpen();
      this._setupCommandPalette();
    },

    /* ============================================================
     * THEME
     * ============================================================ */
    applyTheme() {
      const theme = State.settings.theme;
      document.body.classList.toggle('theme-dark', theme === 'dark');
      document.body.classList.toggle('theme-light', theme === 'light');
      if (typeof monaco !== 'undefined' && monaco.editor) {
        monaco.editor.setTheme(theme === 'light' ? 'jsp-light' : 'jsp-dark');
      }
      this._syncThemeIcons();
    },
    _syncThemeIcons() {
      const light = State.settings.theme === 'light';
      const moon = this.dom.btnTheme.querySelector('.icon-moon');
      const sun = this.dom.btnTheme.querySelector('.icon-sun');
      if (moon) moon.hidden = light;
      if (sun) sun.hidden = !light;
    },

    /* ============================================================
     * FILE TREE
     * ============================================================ */
    renderFileTree() {
      const root = this.dom.fileTree;
      root.innerHTML = '';
      if (!State.project) return;
      root.appendChild(this._renderNode(State.project, 0));
    },

    _renderNode(node, depth) {
      const li = document.createElement('li');
      li.className = 'tree-node' + (node.type === 'folder' && node.expanded ? ' expanded' : '');
      li.dataset.id = node.id;
      li.setAttribute('role', 'treeitem');
      if (node.type === 'folder') {
        li.setAttribute('aria-expanded', node.expanded ? 'true' : 'false');
      }

      const row = document.createElement('div');
      row.className = 'tree-row' + (node.id === State.activeFileId ? ' selected' : '');
      row.style.paddingLeft = (8 + depth * 12) + 'px';
      row.tabIndex = node.id === State.activeFileId ? 0 : -1;
      row.dataset.id = node.id;

      // Chevron (folders only).
      if (node.type === 'folder') {
        const chev = document.createElement('span');
        chev.className = 'tree-chevron';
        chev.innerHTML = ICONS.chevronRight;
        chev.setAttribute('aria-hidden', 'true');
        chev.addEventListener('click', (e) => {
          e.stopPropagation();
          Filesystem.toggleExpand(node.id);
          this.renderFileTree();
        });
        row.appendChild(chev);
      } else {
        const sp = document.createElement('span');
        sp.className = 'tree-chevron';
        sp.innerHTML = '&nbsp;';
        row.appendChild(sp);
      }

      // Icon.
      const icon = document.createElement('span');
      icon.className = 'tree-icon';
      icon.setAttribute('aria-hidden', 'true');
      if (node.type === 'folder') {
        icon.innerHTML = node.expanded ? ICONS.folderOpen : ICONS.folder;
      } else {
        icon.innerHTML = ICONS.jsFile;
      }
      row.appendChild(icon);

      // Label.
      const label = document.createElement('span');
      label.className = 'tree-label';
      label.textContent = node.name;
      row.appendChild(label);

      row.addEventListener('click', () => {
        if (node.type === 'folder') {
          Filesystem.toggleExpand(node.id);
          this.renderFileTree();
        } else {
          Editor.openFile(node.id);
        }
      });

      row.addEventListener('dblclick', () => {
        if (node.type === 'file') {
          // Begin inline rename on double-click.
          this._startRenameInline(node.id, row);
        }
      });

      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showContextMenuFor(node.id, e.clientX, e.clientY);
      });

      // Keyboard activation for tree.
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (node.type === 'folder') {
            Filesystem.toggleExpand(node.id);
            this.renderFileTree();
          } else {
            Editor.openFile(node.id);
          }
        } else if (e.key === 'F2') {
          e.preventDefault();
          this._startRenameInline(node.id, row);
        } else if (e.key === 'Delete') {
          e.preventDefault();
          JSP.Commands.deleteItem(node.id);
        } else if (e.key === 'ArrowRight') {
          if (node.type === 'folder' && !node.expanded) {
            Filesystem.toggleExpand(node.id, true);
            this.renderFileTree();
          }
        } else if (e.key === 'ArrowLeft') {
          if (node.type === 'folder' && node.expanded) {
            Filesystem.toggleExpand(node.id, false);
            this.renderFileTree();
          }
        }
      });

      li.appendChild(row);

      // Children.
      if (node.type === 'folder') {
        const childrenUl = document.createElement('ul');
        childrenUl.className = 'tree-children';
        childrenUl.setAttribute('role', 'group');
        const items = (node.children || []).slice().sort((a, b) => {
          // folders first, then alphabetic.
          if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        items.forEach((child) => childrenUl.appendChild(this._renderNode(child, depth + 1)));
        li.appendChild(childrenUl);
      }
      return li;
    },

    /* ============================================================
     * TABS
     * ============================================================ */
    renderTabs() {
      const t = this.dom.tabs;
      t.innerHTML = '';
      if (State.openTabs.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'tab-empty';
        empty.textContent = 'No file open';
        t.appendChild(empty);
      } else {
        State.openTabs.forEach((id) => {
          const file = State.files.get(id);
          if (!file) return;
          const tab = document.createElement('div');
          tab.className = 'tab' + (id === State.activeFileId ? ' active' : '');
          tab.setAttribute('role', 'tab');
          tab.setAttribute('aria-selected', id === State.activeFileId ? 'true' : 'false');
          tab.dataset.id = id;

          const icon = document.createElement('span');
          icon.className = 'tab-icon';
          icon.innerHTML = ICONS.jsFile;
          tab.appendChild(icon);

          const name = document.createElement('span');
          name.className = 'tab-name';
          name.textContent = file.name;
          tab.appendChild(name);

          const dirty = State.isDirty(id);
          const close = document.createElement('button');
          close.className = 'tab-close';
          close.setAttribute('aria-label', 'Close ' + file.name);
          close.innerHTML = dirty ? '<span class="tab-modified">●</span>' : '&times;';
          close.addEventListener('click', (e) => {
            e.stopPropagation();
            JSP.Commands.closeFile(id);
          });
          tab.appendChild(close);

          tab.addEventListener('click', () => Editor.openFile(id));
          tab.addEventListener('mousedown', (e) => {
            if (e.button === 1) {
              e.preventDefault();
              JSP.Commands.closeFile(id);
            }
          });
          // Right-click on a tab offers file actions.
          tab.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.showContextMenuFor(id, e.clientX, e.clientY);
          });
          t.appendChild(tab);
        });
      }
      // Always show the "+" new-tab button at the end.
      const newTab = document.createElement('button');
      newTab.type = 'button';
      newTab.className = 'tab-new';
      newTab.setAttribute('aria-label', 'New file');
      newTab.title = 'New File';
      newTab.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
      newTab.addEventListener('click', () => JSP.Commands.newFile());
      t.appendChild(newTab);
    },

    /** Lightweight update of a tab's dirty indicator without rebuilding all tabs. */
    updateTabDirtyState(fileId) {
      const tab = this.dom.tabs.querySelector('.tab[data-id="' + fileId + '"]');
      if (!tab) return;
      const close = tab.querySelector('.tab-close');
      if (close) {
        close.innerHTML = State.isDirty(fileId) ? '<span class="tab-modified">●</span>' : '&times;';
      }
    },

    updateBreadcrumb() {
      const bc = this.dom.breadcrumb;
      if (!State.activeFileId) {
        bc.textContent = '';
        return;
      }
      bc.textContent = State.getPath(State.activeFileId);
    },

    /* ============================================================
     * CONSOLE
     * ============================================================ */
    appendConsole(level, args) {
      const body = this.dom && this.dom.consoleBody;
      if (!body) return;
      // Remove "empty" placeholder if present.
      const empty = body.querySelector('.console-empty');
      if (empty) empty.remove();

      // args may be a single string or an array.
      if (!Array.isArray(args)) args = [args];
      const line = document.createElement('div');
      line.className = 'console-line ' + (level || 'log');

      const iconMap = {
        log: { icon: '›', cls: '' },
        info: { icon: 'ℹ', cls: 'info' },
        warn: { icon: '⚠', cls: 'warn' },
        error: { icon: '✕', cls: 'error' },
        debug: { icon: '●', cls: 'debug' },
        success: { icon: '✓', cls: 'success' },
        system: { icon: '›', cls: 'system' },
        result: { icon: '⇐', cls: 'result' }
      };
      const info = iconMap[level] || iconMap.log;

      const iconEl = document.createElement('span');
      iconEl.className = 'cl-icon';
      iconEl.textContent = info.icon;
      line.appendChild(iconEl);

      const textEl = document.createElement('span');
      textEl.className = 'cl-text';

      const formatted = args.map((a) => {
        if (typeof a === 'string') return a;
        if (a && a.__text !== undefined) return a.__text;
        if (a && a.__bigint !== undefined) return a.__bigint;
        if (a instanceof Error) return a.name + ': ' + a.message;
        try {
          return Utils.formatValue(a);
        } catch (_) {
          return String(a);
        }
      });
      textEl.textContent = formatted.join(' ');
      line.appendChild(textEl);

      body.appendChild(line);
      this.scrollConsoleToBottom();
    },

    appendError(err) {
      const body = this.dom.consoleBody;
      const empty = body.querySelector('.console-empty');
      if (empty) empty.remove();
      const line = document.createElement('div');
      line.className = 'console-line error';
      const icon = document.createElement('span');
      icon.className = 'cl-icon';
      icon.textContent = '✕';
      line.appendChild(icon);
      const text = document.createElement('span');
      text.className = 'cl-text';
      text.textContent = (err && err.name ? err.name : 'Error') + ': ' + (err && err.message ? err.message : String(err));
      line.appendChild(text);
      if (err && err.line) {
        const meta = document.createElement('span');
        meta.className = 'cl-meta';
        meta.textContent = 'Line: ' + err.line;
        line.appendChild(meta);
      }
      body.appendChild(line);
      if (err && err.stack) {
        const stackLine = document.createElement('div');
        stackLine.className = 'console-line error';
        const sp = document.createElement('span');
        sp.className = 'cl-text';
        sp.style.opacity = '0.7';
        sp.style.whiteSpace = 'pre-wrap';
        sp.textContent = err.stack;
        const iconSpacer = document.createElement('span');
        iconSpacer.className = 'cl-icon';
        stackLine.appendChild(iconSpacer);
        stackLine.appendChild(sp);
        body.appendChild(stackLine);
      }
      this.scrollConsoleToBottom();
    },

    clearConsole() {
      this.dom.consoleBody.innerHTML = '';
    },

    scrollConsoleToBottom() {
      const body = this.dom.consoleBody;
      body.scrollTop = body.scrollHeight;
    },

    switchConsoleTab(panel) {
      document.querySelectorAll('.console-tab').forEach((t) => {
        t.classList.toggle('active', t.dataset.panel === panel);
      });
      this.dom.consoleBody.hidden = panel !== 'output';
      this.dom.problemsBody.hidden = panel !== 'problems';
    },

    getConsoleText() {
      const lines = Array.from(this.dom.consoleBody.querySelectorAll('.console-line')).map((l) => {
        return l.textContent.trim();
      });
      return lines.join('\n');
    },

    _setupConsoleResize() {
      const onUp = () => {
        document.removeEventListener('mousemove', onMoveH);
        document.removeEventListener('mousemove', onMoveV);
        document.removeEventListener('mouseup', onUp);
        this.dom.resizeH && this.dom.resizeH.classList.remove('dragging');
        this.dom.resizeV && this.dom.resizeV.classList.remove('dragging');
      };
      let startY = 0, startH = 0;
      const onMoveH = (e) => {
        const dy = startY - e.clientY;
        const maxH = Math.max(120, window.innerHeight * 0.6);
        const newH = Math.max(120, Math.min(maxH, startH + dy));
        State.settings.panelHeight = newH;
        State.settings.consoleHeight = newH;
        document.documentElement.style.setProperty('--panel-size', newH + 'px');
        if (Editor.editor) { try { Editor.editor.layout(); } catch (_) {} }
      };
      let startX = 0, startW = 0;
      const onMoveV = (e) => {
        const dx = startX - e.clientX;
        const maxW = Math.max(240, window.innerWidth * 0.7);
        const newW = Math.max(240, Math.min(maxW, startW + dx));
        State.settings.panelWidth = newW;
        document.documentElement.style.setProperty('--panel-size', newW + 'px');
        if (Editor.editor) { try { Editor.editor.layout(); } catch (_) {} }
      };

      if (this.dom.resizeH) {
        this.dom.resizeH.addEventListener('mousedown', (e) => {
          startY = e.clientY;
          startH = this.dom.consolePanel.offsetHeight;
          this.dom.resizeH.classList.add('dragging');
          document.addEventListener('mousemove', onMoveH);
          document.addEventListener('mouseup', onUp);
          e.preventDefault();
        });
        // Double-click resets to default.
        this.dom.resizeH.addEventListener('dblclick', () => {
          State.settings.panelHeight = 280;
          document.documentElement.style.setProperty('--panel-size', '280px');
        });
      }
      if (this.dom.resizeV) {
        this.dom.resizeV.addEventListener('mousedown', (e) => {
          startX = e.clientX;
          startW = this.dom.consolePanel.offsetWidth;
          this.dom.resizeV.classList.add('dragging');
          document.addEventListener('mousemove', onMoveV);
          document.addEventListener('mouseup', onUp);
          e.preventDefault();
        });
        this.dom.resizeV.addEventListener('dblclick', () => {
          State.settings.panelWidth = 420;
          document.documentElement.style.setProperty('--panel-size', '420px');
        });
      }

      // Persist size after resize ends.
      const persist = () => JSP.Commands.persistSettings();
      document.addEventListener('mouseup', () => {
        if (this.dom.resizeH && this.dom.resizeH.classList.contains('dragging')) persist();
        if (this.dom.resizeV && this.dom.resizeV.classList.contains('dragging')) persist();
      });

      // Keyboard support on the resize handles.
      [this.dom.resizeH, this.dom.resizeV].forEach((handle, i) => {
        if (!handle) return;
        handle.addEventListener('keydown', (e) => {
          const vertical = i === 0;
          const delta = e.shiftKey ? 50 : 20;
          let size = vertical
            ? (State.settings.panelHeight || 280)
            : (State.settings.panelWidth || 420);
          if (e.key === 'ArrowDown' && vertical) size += delta;
          else if (e.key === 'ArrowUp' && vertical) size -= delta;
          else if (e.key === 'ArrowRight' && !vertical) size -= delta;
          else if (e.key === 'ArrowLeft' && !vertical) size += delta;
          else return;
          e.preventDefault();
          size = Math.max(vertical ? 120 : 240, size);
          if (vertical) State.settings.panelHeight = size;
          else State.settings.panelWidth = size;
          document.documentElement.style.setProperty('--panel-size', size + 'px');
          if (Editor.editor) { try { Editor.editor.layout(); } catch (_) {} }
          persist();
        });
      });
    },

    /* ============================================================
     * STATUS BAR
     * ============================================================ */
    setRunning(isRunning) {
      const btn = this.dom.btnRun;
      const label = btn.querySelector('.run-label');
      const iconRun = btn.querySelector('.icon-run');
      const iconStop = btn.querySelector('.icon-stop');
      btn.classList.toggle('running', isRunning);
      btn.setAttribute('aria-label', isRunning ? 'Stop' : 'Run');
      btn.title = isRunning ? 'Stop' : 'Run (Ctrl/Cmd + Enter)';
      if (label) label.textContent = isRunning ? 'Stop' : 'Run';
      if (iconRun) iconRun.hidden = isRunning;
      if (iconStop) iconStop.hidden = !isRunning;
    },

    updateSaveStatus(state, msg) {
      const el = this.dom.statusSave;
      el.classList.remove('saved', 'saving', 'error');
      switch (state) {
        case 'saved':
          el.textContent = '✓ Saved';
          el.classList.add('saved');
          break;
        case 'saving':
          el.textContent = '⟳ Saving...';
          el.classList.add('saving');
          break;
        case 'unsaved':
          el.textContent = '● Unsaved';
          break;
        case 'error':
          el.textContent = msg || 'Save failed';
          el.classList.add('error');
          break;
        case 'ready':
        default:
          el.textContent = 'Ready';
      }
    },

    updateExecStatus(text) {
      this.dom.statusExec.textContent = text || '';
    },

    updateIndentStatus() {
      this.dom.statusIndent.textContent = 'Spaces: ' + State.settings.tabSize;
    },

    /* ============================================================
     * CONTEXT MENU
     * ============================================================ */
    showContextMenuFor(nodeId, x, y) {
      const node = State.findNode(nodeId);
      if (!node) return;
      this._ctxTarget = nodeId;
      const menu = this.dom.contextMenu;
      menu.innerHTML = '';

      const items = [];
      if (node.type === 'folder' || nodeId === 'root' || node.id === State.project.id) {
        items.push({ label: 'New File', action: 'newFileHere' });
        items.push({ label: 'New Folder', action: 'newFolderHere' });
        items.push({ separator: true });
      }
      if (node.type === 'file') {
        items.push({ label: 'Open', action: 'open' });
      }
      items.push({ label: 'Rename', action: 'rename', shortcut: 'F2' });
      items.push({ label: 'Delete', action: 'delete', shortcut: 'Del', danger: true });
      if (node.type === 'file') {
        items.push({ separator: true });
        items.push({ label: 'Download', action: 'download' });
      }

      items.forEach((it) => {
        if (it.separator) {
          const sep = document.createElement('li');
          sep.className = 'ctx-separator';
          menu.appendChild(sep);
          return;
        }
        const li = document.createElement('li');
        li.setAttribute('role', 'menuitem');
        li.tabIndex = 0;
        const lbl = document.createElement('span');
        lbl.textContent = it.label;
        li.appendChild(lbl);
        if (it.shortcut) {
          const sc = document.createElement('span');
          sc.className = 'ctx-shortcut';
          sc.textContent = it.shortcut;
          li.appendChild(sc);
        }
        if (it.danger) li.style.color = 'var(--danger)';
        li.addEventListener('click', () => {
          this.hideContextMenu();
          this._handleContextAction(it.action, nodeId);
        });
        li.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') li.click();
        });
        menu.appendChild(li);
      });

      menu.hidden = false;
      // Position and keep on screen.
      const rect = menu.getBoundingClientRect();
      const maxX = window.innerWidth - rect.width - 4;
      const maxY = window.innerHeight - rect.height - 4;
      menu.style.left = Math.min(x, maxX) + 'px';
      menu.style.top = Math.min(y, maxY) + 'px';
      const first = menu.querySelector('li');
      if (first) first.focus();
    },

    hideContextMenu() {
      this.dom.contextMenu.hidden = true;
      this._ctxTarget = null;
    },

    _handleContextAction(action, nodeId) {
      switch (action) {
        case 'open': {
          const node = State.findNode(nodeId);
          if (node && node.type === 'file') Editor.openFile(nodeId);
          break;
        }
        case 'newFileHere': {
          const node = State.findNode(nodeId);
          const parentId = (node && node.type === 'folder') ? nodeId : null;
          JSP.Commands.newFile(parentId);
          break;
        }
        case 'newFolderHere': {
          const node = State.findNode(nodeId);
          const parentId = (node && node.type === 'folder') ? nodeId : null;
          JSP.Commands.newFolder(parentId);
          break;
        }
        case 'rename':
          JSP.Commands.rename(nodeId);
          break;
        case 'delete':
          JSP.Commands.deleteItem(nodeId);
          break;
        case 'download':
          JSP.Commands.downloadFile(nodeId);
          break;
      }
    },

    /* ============================================================
     * INLINE RENAME
     * ============================================================ */
    _startRenameInline(nodeId, row) {
      const node = State.findNode(nodeId);
      if (!node) return;
      row.classList.add('renaming');
      const label = row.querySelector('.tree-label');
      const oldName = node.name;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = oldName;
      input.setAttribute('aria-label', 'Rename ' + oldName);
      label.replaceWith(input);
      input.focus();
      // Select the stem (without extension for files).
      const dot = node.type === 'file' ? oldName.lastIndexOf('.') : -1;
      input.setSelectionRange(0, dot > 0 ? dot : oldName.length);

      const commit = () => {
        const newName = input.value;
        if (newName === oldName) {
          this.renderFileTree();
          return;
        }
        const res = Filesystem.rename(nodeId, newName);
        if (!res.ok) {
          this.toast(res.error, 'error');
          this.renderFileTree();
          return;
        }
        // If this is a file, update model URI path.
        if (node.type === 'file' && Editor.monaco && State.models.has(nodeId)) {
          const model = State.models.get(nodeId);
          try {
            // Monaco doesn't allow direct URI renaming — we dispose and recreate lazily.
            // But we want to preserve content; easiest is keep model as-is; path label changes.
            // (IntelliSense still works because language is javascript.)
          } catch (_) {}
        }
        this.renderFileTree();
        this.renderTabs();
        this.updateBreadcrumb();
        JSP.Commands.persistProject();
      };
      const cancel = () => this.renderFileTree();

      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          input.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          input.removeEventListener('blur', commit);
          cancel();
        }
      });
    },

    /* ============================================================
     * DROPDOWN MENUS (File / Edit / View / Run)
     * ============================================================ */
    openMenu(name, anchor) {
      this.closeMenu();
      const menu = this.dom.menuDropdown;
      menu.innerHTML = '';
      const items = this._getMenuItems(name);
      items.forEach((it) => {
        if (it === '-') {
          const sep = document.createElement('div');
          sep.className = 'dropdown-separator';
          menu.appendChild(sep);
          return;
        }
        if (it.label_only) {
          const lbl = document.createElement('div');
          lbl.className = 'dropdown-label';
          lbl.textContent = it.label_only;
          menu.appendChild(lbl);
          return;
        }
        const row = document.createElement('div');
        row.className = 'dropdown-item';
        row.setAttribute('role', 'menuitem');
        row.tabIndex = 0;
        const text = document.createElement('span');
        text.textContent = it.label;
        row.appendChild(text);
        if (it.shortcut) {
          const sc = document.createElement('span');
          sc.className = 'dropdown-shortcut';
          sc.textContent = it.shortcut;
          row.appendChild(sc);
        }
        row.addEventListener('click', () => {
          this.closeMenu();
          it.action && it.action();
        });
        row.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') row.click();
        });
        menu.appendChild(row);
      });
      menu.hidden = false;
      const rect = anchor.getBoundingClientRect();
      menu.style.left = rect.left + 'px';
      menu.style.top = rect.bottom + 'px';
      anchor.setAttribute('aria-expanded', 'true');
      this._activeMenu = name;
    },

    closeMenu() {
      if (!this._activeMenu) return;
      this.dom.menuDropdown.hidden = true;
      const btn = document.querySelector('.menu-item[data-menu="' + this._activeMenu + '"]');
      if (btn) btn.setAttribute('aria-expanded', 'false');
      this._activeMenu = null;
    },

    _runEditorAction(id) {
      if (!Editor.editor) return;
      const action = Editor.editor.getAction(id);
      if (action) action.run();
    },

    /** Get the pretty shortcut label for a bindable action id. */
    _sc(actionId) {
      if (!JSP.KeyBindings) return '';
      const chord = JSP.KeyBindings.chordFor(actionId);
      return chord ? JSP.KeyBindings.pretty(chord) : '';
    },

    _getMenuItems(name) {
      const C = JSP.Commands;
      switch (name) {
        case 'file':
          return [
            { label: 'New File', shortcut: this._sc('newFile'), action: () => C.newFile() },
            { label: 'New Folder', action: () => C.newFolder() },
            '-',
            { label: 'Save', shortcut: this._sc('save'), action: () => C.save() },
            { label: 'Save All', action: () => C.save() },
            '-',
            { label: 'Download File', action: () => C.downloadActiveFile() },
            { label: 'Export Project (ZIP)', action: () => C.exportProject() },
            { label: 'Import Project (ZIP)', action: () => C.importProject() },
            '-',
            { label: 'Reset Project', action: () => this.confirm(
              'Reset project?',
              'This will replace all current files with the default examples. This cannot be undone.',
              'Reset', () => C.resetProject())
            }
          ];
        case 'edit':
          return [
            { label: 'Undo', action: () => this._runEditorAction('undo') },
            { label: 'Redo', action: () => this._runEditorAction('redo') },
            '-',
            { label: 'Cut', action: () => this._runEditorAction('editor.action.clipboardCutAction') },
            { label: 'Copy', action: () => this._runEditorAction('editor.action.clipboardCopyAction') },
            { label: 'Paste', action: () => this._runEditorAction('editor.action.clipboardPasteAction') },
            '-',
            { label: 'Find', shortcut: this._sc('find'), action: () => this._runEditorAction('actions.find') },
            { label: 'Replace', shortcut: this._sc('replace'), action: () => this._runEditorAction('editor.action.startFindReplaceAction') },
            '-',
            { label: 'Toggle Line Comment', action: () => this._runEditorAction('editor.action.commentLine') },
            { label: 'Format Document', shortcut: this._sc('formatDocument'), action: () => C.formatDocument() },
            '-',
            { label: 'Insert Snippet...', action: () => this.openSnippetPicker() }
          ];
        case 'view':
          return [
            { label: 'Command Palette', shortcut: this._sc('commandPalette'), action: () => this.openCommandPalette() },
            { label: 'Quick Open', shortcut: this._sc('quickOpen'), action: () => this.openQuickOpen() },
            '-',
            { label: 'Toggle Sidebar', shortcut: this._sc('toggleSidebar'), action: () => C.toggleSidebar() },
            { label: 'Toggle Console Panel', shortcut: this._sc('togglePanel'), action: () => C.togglePanel() },
            { label_only: 'Panel Position' },
            { label: '   Dock to Right', action: () => C.setPanelPosition('right') },
            { label: '   Dock to Bottom', action: () => C.setPanelPosition('bottom') },
            '-',
            { label: 'Toggle Minimap', action: () => {
              State.settings.minimap = !State.settings.minimap;
              this.dom.setMinimap.checked = State.settings.minimap;
              if (Editor.editor) Editor.applySettings();
              C.persistSettings();
            } },
            { label: 'Toggle Word Wrap', shortcut: this._sc('toggleWordWrap'), action: () => {
              State.settings.wordWrap = !State.settings.wordWrap;
              this.dom.setWordWrap.checked = State.settings.wordWrap;
              if (Editor.editor) Editor.applySettings();
              C.persistSettings();
            } },
            '-',
            { label: 'Toggle Theme', action: () => C.toggleTheme() },
            { label: 'Keyboard Shortcuts', action: () => { this.openSettings(); this.openSettingsTab('shortcuts'); } },
            { label: 'Settings', shortcut: this._sc('settings'), action: () => this.openSettings() }
          ];
        case 'run':
          return [
            { label: 'Run JavaScript', shortcut: this._sc('run'), action: () => C.run('menu') },
            { label: 'Stop Execution', action: () => C.stop() },
            '-',
            { label: 'Clear Console', shortcut: this._sc('clearConsole'), action: () => C.clearConsole() }
          ];
        case 'help':
          return [
            { label: 'Keyboard Shortcuts', action: () => { this.openSettings(); this.openSettingsTab('shortcuts'); } },
            { label: 'About JS Playground', action: () => this.openAbout() }
          ];
      }
      return [];
    },

    /* ============================================================
     * QUICK OPEN
     * ============================================================ */
    _setupQuickOpen() {
      const input = this.dom.quickOpenInput;
      const list = this.dom.quickOpenResults;
      let selected = 0;
      let results = [];

      const render = () => {
        const q = input.value.trim().toLowerCase();
        results = Filesystem.listFiles().filter((f) => {
          if (!q) return true;
          return f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q);
        }).slice(0, 50);
        list.innerHTML = '';
        if (results.length === 0) {
          const empty = document.createElement('li');
          empty.className = 'quick-open-empty';
          empty.textContent = 'No matching files';
          list.appendChild(empty);
          selected = 0;
          return;
        }
        results.forEach((f, i) => {
          const li = document.createElement('li');
          li.setAttribute('role', 'option');
          li.dataset.id = f.id;
          if (i === selected) li.classList.add('selected');
          const icon = document.createElement('span');
          icon.innerHTML = ICONS.jsFile;
          li.appendChild(icon);
          const name = document.createElement('span');
          name.textContent = f.name;
          li.appendChild(name);
          const path = document.createElement('span');
          path.className = 'result-path';
          path.textContent = f.path;
          li.appendChild(path);
          li.addEventListener('click', () => selectEntry(i));
          li.addEventListener('mouseenter', () => {
            selected = i;
            updateSelection();
          });
          list.appendChild(li);
        });
      };
      const updateSelection = () => {
        Array.from(list.children).forEach((c, i) => c.classList.toggle('selected', i === selected));
        const sel = list.children[selected];
        if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' });
      };
      const selectEntry = (i) => {
        const f = results[i];
        if (!f) return;
        this.closeAllOverlays();
        Editor.openFile(f.id);
      };

      input.addEventListener('input', () => { selected = 0; render(); });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          selected = Math.min((results.length || 1) - 1, selected + 1);
          updateSelection();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          selected = Math.max(0, selected - 1);
          updateSelection();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          selectEntry(selected);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.closeAllOverlays();
        }
      });
      this._quickOpenRender = render;
    },

    openQuickOpen() {
      this.closeAllOverlays();
      this.dom.quickOpenOverlay.hidden = false;
      this.dom.quickOpenInput.value = '';
      this._quickOpenRender && this._quickOpenRender();
      setTimeout(() => this.dom.quickOpenInput.focus(), 0);
    },

    /* ============================================================
     * COMMAND PALETTE
     * ============================================================ */
    _setupCommandPalette() {
      const input = this.dom.commandPaletteInput;
      const list = this.dom.commandPaletteResults;
      let selected = 0;
      let commands = [];

      const allCommands = () => JSP.Commands.list();

      const render = () => {
        const q = input.value.trim().toLowerCase();
        commands = allCommands().filter((c) => {
          if (!q) return true;
          return c.label.toLowerCase().includes(q) || (c.category && c.category.toLowerCase().includes(q));
        }).slice(0, 50);
        list.innerHTML = '';
        if (commands.length === 0) {
          const empty = document.createElement('li');
          empty.className = 'quick-open-empty';
          empty.textContent = 'No matching commands';
          list.appendChild(empty);
          selected = 0;
          return;
        }
        commands.forEach((c, i) => {
          const li = document.createElement('li');
          li.setAttribute('role', 'option');
          if (i === selected) li.classList.add('selected');
          const name = document.createElement('span');
          name.textContent = c.label;
          li.appendChild(name);
          if (c.category) {
            const cat = document.createElement('span');
            cat.className = 'result-desc';
            cat.textContent = c.category;
            li.appendChild(cat);
          }
          li.addEventListener('click', () => selectEntry(i));
          li.addEventListener('mouseenter', () => { selected = i; updateSelection(); });
          list.appendChild(li);
        });
      };
      const updateSelection = () => {
        Array.from(list.children).forEach((c, i) => c.classList.toggle('selected', i === selected));
        const sel = list.children[selected];
        if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' });
      };
      const selectEntry = (i) => {
        const c = commands[i];
        if (!c) return;
        this.closeAllOverlays();
        try { c.run(); } catch (e) { this.toast(e.message, 'error'); }
      };

      input.addEventListener('input', () => { selected = 0; render(); });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          selected = Math.min((commands.length || 1) - 1, selected + 1);
          updateSelection();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          selected = Math.max(0, selected - 1);
          updateSelection();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          selectEntry(selected);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.closeAllOverlays();
        }
      });
      this._commandPaletteRender = render;
    },

    openCommandPalette() {
      this.closeAllOverlays();
      this.dom.commandPaletteOverlay.hidden = false;
      this.dom.commandPaletteInput.value = '';
      this._commandPaletteRender && this._commandPaletteRender();
      setTimeout(() => this.dom.commandPaletteInput.focus(), 0);
    },

    openSnippetPicker() {
      if (!Editor.editor) {
        this.toast('Open a file first to insert a snippet.', 'warn');
        return;
      }
      const snippets = (JSP.Snippets && JSP.Snippets.list()) || [];
      this._openGenericPicker(
        'Insert Snippet',
        snippets.map((s) => ({
          label: s.label,
          description: s.detail,
          run: () => {
            const monaco = Editor.monaco;
            if (!monaco) return;
            // Use the snippet controller to insert with tab stops.
            const snippetController = Editor.editor.getContribution('snippetController2');
            if (snippetController) {
              snippetController.insert(s.body);
            } else {
              // Fallback: strip tab stops and insert as text.
              const text = s.body
                .replace(/\$\{\d+\|([^}]+)\}/g, '$1')
                .replace(/\$\{\d+:([^}]*)\}/g, '$1')
                .replace(/\$\d+/g, '');
              Editor.editor.executeEdits('snippet', [{
                range: Editor.editor.getSelection(),
                text: text,
                forceMoveMarkers: true
              }]);
            }
            Editor.focus();
            this.toast('Snippet inserted: ' + s.label, 'success');
          }
        }))
      );
    },

    /**
     * A generic search-picker overlay used by snippets etc.
     * Each item is { label, description, run }.
     */
    _openGenericPicker(title, items) {
      this.closeAllOverlays();
      const overlay = this.dom.commandPaletteOverlay;
      const input = this.dom.commandPaletteInput;
      const list = this.dom.commandPaletteResults;
      overlay.hidden = false;
      input.value = '';
      input.placeholder = title || 'Search...';
      let selected = 0;
      let filtered = items.slice();
      const render = () => {
        const q = input.value.trim().toLowerCase();
        filtered = items.filter((it) =>
          !q ||
          it.label.toLowerCase().includes(q) ||
          (it.description || '').toLowerCase().includes(q)
        );
        list.innerHTML = '';
        if (filtered.length === 0) {
          const empty = document.createElement('li');
          empty.className = 'quick-open-empty';
          empty.textContent = 'No matches';
          list.appendChild(empty);
          return;
        }
        filtered.forEach((it, i) => {
          const li = document.createElement('li');
          if (i === selected) li.classList.add('selected');
          const lbl = document.createElement('span');
          lbl.textContent = it.label;
          li.appendChild(lbl);
          if (it.description) {
            const d = document.createElement('span');
            d.className = 'result-desc';
            d.textContent = it.description;
            li.appendChild(d);
          }
          li.addEventListener('click', () => select(i));
          li.addEventListener('mouseenter', () => { selected = i; updateSelection(); });
          list.appendChild(li);
        });
      };
      const updateSelection = () => {
        Array.from(list.children).forEach((c, i) => c.classList.toggle('selected', i === selected));
      };
      const select = (i) => {
        const it = filtered[i];
        if (!it) return;
        close();
        it.run && it.run();
      };
      const close = () => {
        overlay.hidden = true;
        input.placeholder = 'Type a command...';
        input.removeEventListener('input', onInput);
        input.removeEventListener('keydown', onKey);
        if (Editor.editor) Editor.focus();
      };
      const onInput = () => { selected = 0; render(); };
      const onKey = (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); selected = Math.min(filtered.length - 1, selected + 1); updateSelection(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); selected = Math.max(0, selected - 1); updateSelection(); }
        else if (e.key === 'Enter') { e.preventDefault(); select(selected); }
        else if (e.key === 'Escape') { e.preventDefault(); close(); }
      };
      input.addEventListener('input', onInput);
      input.addEventListener('keydown', onKey);
      render();
      setTimeout(() => input.focus(), 0);
    },

    closeAllOverlays() {
      this.dom.quickOpenOverlay.hidden = true;
      this.dom.commandPaletteOverlay.hidden = true;
      // Settings is closed by its own close button / outside-click; not via Escape
      // when other overlays are open.
      if (Editor.editor) Editor.focus();
    },

    /* ============================================================
     * SETTINGS
     * ============================================================ */
    openSettings() {
      this.closeAllOverlays();
      const s = State.settings;
      this.dom.setTheme.value = s.theme;
      this.dom.setFontSize.value = String(s.fontSize);
      this.dom.fontSizeVal.textContent = String(s.fontSize);
      this.dom.setTabSize.value = String(s.tabSize);
      this.dom.setWordWrap.checked = !!s.wordWrap;
      this.dom.setMinimap.checked = !!s.minimap;
      this.dom.setAutosave.checked = !!s.autoSave;
      if (this.dom.setPanelPosition) {
        this.dom.setPanelPosition.value = s.panelPosition || 'right';
      }
      if (this.dom.setPlatform) this.dom.setPlatform.value = 'auto';
      this.openSettingsTab('general');
      this.dom.settingsOverlay.hidden = false;
      this.dom.setTheme.focus();
    },

    openSettingsTab(name) {
      this.dom.settingsTabs.forEach((t) => {
        const active = t.dataset.tab === name;
        t.classList.toggle('active', active);
        t.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      this.dom.settingsBodies.forEach((b) => {
        b.hidden = b.dataset.settingsTab !== name;
      });
      if (name === 'shortcuts') {
        this._renderShortcuts();
      }
    },

    closeSettings() {
      this.dom.settingsOverlay.hidden = true;
      if (Editor.editor) Editor.focus();
    },

    /* -------------- Keyboard shortcuts editor -------------- */
    _renderShortcuts() {
      const list = this.dom.shortcutsList;
      if (!list || !JSP.KeyBindings) return;
      const query = (this.dom.shortcutSearch.value || '').trim().toLowerCase();
      list.innerHTML = '';
      const entries = JSP.KeyBindings.BINDABLE.slice().sort((a, b) => a.label.localeCompare(b.label));
      let shown = 0;
      for (const entry of entries) {
        if (query) {
          const hay = (entry.label + ' ' + entry.category + ' ' + entry.id).toLowerCase();
          if (!hay.includes(query)) continue;
        }
        shown++;
        const li = document.createElement('li');
        li.className = 'shortcut-row';

        const info = document.createElement('div');
        info.className = 'shortcut-info';
        const label = document.createElement('div');
        label.className = 'shortcut-label';
        label.textContent = entry.label;
        const cat = document.createElement('div');
        cat.className = 'shortcut-cat';
        cat.textContent = entry.category;
        info.appendChild(label);
        info.appendChild(cat);

        const keys = document.createElement('div');
        keys.className = 'shortcut-keys';
        const chordBtn = document.createElement('button');
        chordBtn.type = 'button';
        chordBtn.className = 'kbd-key';
        chordBtn.setAttribute('aria-label', 'Click to rebind ' + entry.label);
        const chord = JSP.KeyBindings.chordFor(entry.id);
        chordBtn.textContent = chord ? JSP.KeyBindings.pretty(chord) : 'Not set';
        chordBtn.dataset.actionId = entry.id;
        chordBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._recordShortcut(chordBtn, entry.id);
        });
        keys.appendChild(chordBtn);

        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'kbd-reset';
        resetBtn.textContent = '↺';
        resetBtn.title = 'Reset to default';
        resetBtn.setAttribute('aria-label', 'Reset ' + entry.label + ' to default');
        resetBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          JSP.KeyBindings.resetBinding(entry.id);
          this._renderShortcuts();
        });
        keys.appendChild(resetBtn);

        li.appendChild(info);
        li.appendChild(keys);
        list.appendChild(li);
      }
      if (shown === 0) {
        const empty = document.createElement('li');
        empty.className = 'shortcut-empty';
        empty.textContent = 'No shortcuts match your search.';
        list.appendChild(empty);
      }
    },

    _recordShortcut(btn, actionId) {
      btn.classList.add('recording');
      btn.textContent = 'Press keys...';
      const onKey = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Escape') {
          cleanup();
          this._renderShortcuts();
          return;
        }
        if (e.key === 'Backspace') {
          JSP.KeyBindings.setBinding(actionId, '');
          cleanup();
          this._renderShortcuts();
          return;
        }
        const chord = JSP.KeyBindings.fromEvent(e);
        if (!chord || chord.split('+').every((p) => ['ctrl','alt','shift','meta'].includes(p))) {
          return; // pure modifier press — wait for the actual key
        }
        const conflicts = JSP.KeyBindings.findConflicts(chord, actionId);
        if (conflicts.length > 0) {
          btn.classList.remove('recording');
          btn.classList.add('conflict');
          btn.textContent = JSP.KeyBindings.pretty(chord) + ' ⚠';
          btn.title = 'Conflicts with: ' + conflicts.join(', ');
          // Still set it (we cleared the other one in setBinding), but show a warning.
        }
        JSP.KeyBindings.setBinding(actionId, chord);
        cleanup();
        this._renderShortcuts();
      };
      const cleanup = () => {
        document.removeEventListener('keydown', onKey, true);
        btn.classList.remove('recording');
      };
      document.addEventListener('keydown', onKey, true);
    },

    _updateKbdHints() {
      // Update visible shortcut labels that mention Ctrl/Cmd.
      const kbd = document.getElementById('kbd-new-file');
      if (kbd && JSP.KeyBindings) {
        const chord = JSP.KeyBindings.chordFor('newFile');
        kbd.textContent = chord ? JSP.KeyBindings.pretty(chord) : 'New File';
      }
    },

    openAbout() {
      const dlg = document.getElementById('about-dialog');
      if (!dlg) return;
      const closeBtn = dlg.querySelector('button[data-action="close"]');
      const close = () => {
        try { dlg.close(); } catch (_) { dlg.hidden = true; }
        if (Editor.editor) Editor.focus();
      };
      closeBtn.addEventListener('click', close, { once: true });
      if (typeof dlg.showModal === 'function') {
        if (!dlg.open) dlg.showModal();
      } else {
        dlg.hidden = false;
      }
    },

    _showShortcuts() {
      const mac = Utils.isMac();
      const mod = mac ? '⌘' : 'Ctrl';
      const lines = [
        ['Run code', mod + ' + Enter'],
        ['Save', mod + ' + S'],
        ['Command Palette', mod + ' + Shift + P'],
        ['Quick Open', mod + ' + P'],
        ['Toggle Sidebar', mod + ' + B'],
        ['New File', mod + ' + N'],
        ['Close File', mod + ' + W'],
        ['Find', mod + ' + F'],
        ['Replace', mod + ' + H'],
        ['Format Document', 'Shift + Alt + F'],
        ['Toggle Word Wrap', 'Alt + Z'],
        ['Settings', mod + ' + ,']
      ];
      const message = lines.map(([k, v]) => k.padEnd(22, ' ') + '  ' + v).join('\n');
      window.alert('Keyboard Shortcuts\n\n' + message);
      if (Editor.editor) Editor.focus();
    },

    /* ============================================================
     * MODALS
     * ============================================================ */
    confirm(title, message, confirmLabel, onConfirm, danger) {
      const dlg = this.dom.confirmDialog;
      const titleEl = dlg.querySelector('#confirm-title');
      const msgEl = this.dom.confirmMessage;
      const actions = this.dom.confirmActions;
      titleEl.textContent = title;
      msgEl.textContent = message;
      actions.innerHTML = '';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'modal-btn';
      cancel.dataset.action = 'cancel';
      cancel.textContent = 'Cancel';
      const ok = document.createElement('button');
      ok.type = 'button';
      ok.className = 'modal-btn ' + (danger !== false ? 'danger' : 'primary');
      ok.dataset.action = 'confirm';
      ok.textContent = confirmLabel || 'OK';
      actions.appendChild(cancel);
      actions.appendChild(ok);
      const close = () => { try { dlg.close(); } catch (_) { dlg.hidden = true; } };
      const cleanup = () => {
        cancel.removeEventListener('click', onCancel);
        ok.removeEventListener('click', onOk);
      };
      const onCancel = () => { cleanup(); close(); };
      const onOk = () => { cleanup(); close(); onConfirm && onConfirm(); };
      cancel.addEventListener('click', onCancel);
      ok.addEventListener('click', onOk);
      if (typeof dlg.showModal === 'function') {
        if (!dlg.open) dlg.showModal();
      } else {
        dlg.hidden = false;
      }
      ok.focus();
    },

    /**
     * Show the "save changes?" dialog. Returns a promise that resolves with
     * 'save', 'discard', or 'cancel'.
     */
    async unsavedChangesPrompt(fileName) {
      return new Promise((resolve) => {
        const dlg = this.dom.unsavedDialog;
        const msg = this.dom.unsavedMessage;
        msg.textContent = '"' + fileName + '" has unsaved changes.\n\nSave before closing?';
        const actions = dlg.querySelectorAll('button[data-action]');
        const close = () => { try { dlg.close(); } catch (_) { dlg.hidden = true; } };
        const handlers = [];
        const done = (val) => {
          actions.forEach((b) => b.removeEventListener('click', handlers[0]));
          close();
          resolve(val);
        };
        actions.forEach((b) => {
          const h = () => done(b.dataset.action);
          handlers.push(h);
          b.addEventListener('click', h);
        });
        if (typeof dlg.showModal === 'function') {
          if (!dlg.open) dlg.showModal();
        } else {
          dlg.hidden = false;
        }
        const saveBtn = dlg.querySelector('button[data-action="save"]');
        if (saveBtn) saveBtn.focus();
      });
    },

    /** Rename prompt (prefer inline rename when possible; used by command palette). */
    async promptRename(nodeId) {
      const node = State.findNode(nodeId);
      if (!node) return;
      return new Promise((resolve) => {
        const dlg = this.dom.renameDialog;
        const input = this.dom.renameInput;
        const error = this.dom.renameError;
        input.value = node.name;
        error.hidden = true;
        const confirmBtn = dlg.querySelector('button[data-action="confirm"]');
        const cancelBtn = dlg.querySelector('button[data-action="cancel"]');
        const close = () => { try { dlg.close(); } catch (_) { dlg.hidden = true; } };

        const onConfirm = () => {
          const res = Filesystem.rename(nodeId, input.value);
          if (!res.ok) {
            error.textContent = res.error;
            error.hidden = false;
            return;
          }
          cleanup();
          close();
          this.renderFileTree();
          this.renderTabs();
          this.updateBreadcrumb();
          JSP.Commands.persistProject();
          resolve(true);
        };
        const onCancel = () => { cleanup(); close(); resolve(false); };
        const onKey = (e) => {
          if (e.key === 'Enter') { e.preventDefault(); onConfirm(); }
          else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        };
        function cleanup() {
          confirmBtn.removeEventListener('click', onConfirm);
          cancelBtn.removeEventListener('click', onCancel);
          input.removeEventListener('keydown', onKey);
        }
        confirmBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
        input.addEventListener('keydown', onKey);
        if (typeof dlg.showModal === 'function') {
          if (!dlg.open) dlg.showModal();
        } else {
          dlg.hidden = false;
        }
        setTimeout(() => { input.focus(); input.select(); }, 0);
      });
    },

    /* ============================================================
     * TOAST
     * ============================================================ */
    toast(message, type) {
      const t = document.createElement('div');
      t.className = 'toast' + (type ? ' ' + type : '');
      t.textContent = message;
      t.setAttribute('role', 'status');
      this.dom.toastContainer.appendChild(t);
      setTimeout(() => {
        t.style.transition = 'opacity 0.3s ease';
        t.style.opacity = '0';
        setTimeout(() => t.remove(), 300);
      }, 2200);
    }
  };

  JSP.UI = UI;
})(window);
