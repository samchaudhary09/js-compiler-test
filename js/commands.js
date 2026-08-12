/* ============ commands.js ============ */
(function (global) {
  'use strict';

  const JSP = global.JSP || (global.JSP = {});
  const { State, Utils, Filesystem, Editor, Execution, UI } = JSP;

  const PROJECT_KEY = 'jsp.project';
  const STATE_KEY = 'jsp.state';
  const SAVE_DEBOUNCE_MS = 700;

  const Commands = {
    _autoSaveDebounced: null,

    /** List all commands (for command palette). */
    list() {
      return [
        { label: 'Run JavaScript', category: 'Execution', run: () => this.run('palette') },
        { label: 'Stop Execution', category: 'Execution', run: () => this.stop() },
        { label: 'Clear Console', category: 'Console', run: () => this.clearConsole() },
        { label: 'Copy Console Output', category: 'Console', run: () => this.copyConsoleOutput() },
        { label: 'Save File', category: 'File', run: () => this.save() },
        { label: 'New File', category: 'File', run: () => this.newFile() },
        { label: 'New Folder', category: 'File', run: () => this.newFolder() },
        { label: 'Rename Active File', category: 'File', run: () => State.activeFileId && this.rename(State.activeFileId) },
        { label: 'Delete Active File', category: 'File', run: () => State.activeFileId && this.deleteItem(State.activeFileId) },
        { label: 'Close File', category: 'File', run: () => this.closeActiveFile() },
        { label: 'Download File', category: 'File', run: () => this.downloadActiveFile() },
        { label: 'Export Project as ZIP', category: 'File', run: () => this.exportProject() },
        { label: 'Import Project from ZIP', category: 'File', run: () => this.importProject() },
        { label: 'Format Document', category: 'Editor', run: () => this.formatDocument() },
        { label: 'Toggle Sidebar', category: 'View', run: () => this.toggleSidebar() },
        { label: 'Toggle Console Panel', category: 'View', run: () => this.togglePanel() },
        { label: 'Dock Panel to Bottom', category: 'View', run: () => this.setPanelPosition('bottom') },
        { label: 'Dock Panel to Right', category: 'View', run: () => this.setPanelPosition('right') },
        { label: 'Toggle Minimap', category: 'View', run: () => this.toggleMinimap() },
        { label: 'Toggle Word Wrap', category: 'View', run: () => this.toggleWordWrap() },
        { label: 'Toggle Theme', category: 'View', run: () => this.toggleTheme() },
        { label: 'Toggle Auto Save', category: 'Settings', run: () => this.toggleAutoSave() },
        { label: 'Open Settings', category: 'Settings', run: () => UI.openSettings() },
        { label: 'Insert Snippet', category: 'Editor', run: () => UI.openSnippetPicker() },
        { label: 'Reset Project', category: 'Settings', run: () => this.confirmReset() }
      ];
    },

    /* ---------------- Execution ---------------- */
    run(source) {
      if (Execution.isRunning()) {
        this.stop('user');
        return;
      }
      const file = State.files.get(State.activeFileId);
      if (!file) {
        UI.toast('Open a JavaScript file first.', 'warn');
        return;
      }
      let code = file.content;
      // If source is 'shortcut'/'palette'/'button', read from active model (handles unsaved content).
      if (Editor.editor) {
        const model = Editor.editor.getModel();
        if (model) code = model.getValue();
        file.content = code;
      }
      Execution.run(code);
    },

    stop(reason) {
      if (Execution.isRunning()) Execution.stop(reason || 'user');
    },

    clearConsole() {
      UI.clearConsole();
      UI.toast('Console cleared', 'success');
    },

    async copyConsoleOutput() {
      const text = UI.getConsoleText();
      if (!text) {
        UI.toast('Console is empty', 'warn');
        return;
      }
      const ok = await Utils.copyToClipboard(text);
      if (ok) {
        const btn = document.getElementById('btn-copy-console');
        if (btn) {
          const old = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = old; }, 1200);
        } else {
          UI.toast('Copied', 'success');
        }
      } else {
        UI.toast('Could not copy to clipboard', 'error');
      }
    },

    /* ---------------- File operations ---------------- */
    newFile(parentFolderId) {
      const parent = parentFolderId ? State.findNode(parentFolderId) : State.project;
      if (!parent) return;
      const file = Filesystem.createFile(parent ? parent.id : null);
      this.persistProject();
      UI.renderFileTree();
      Editor.openFile(file.id);
      // Begin inline rename of the new file.
      setTimeout(() => {
        const row = document.querySelector('.tree-row[data-id="' + file.id + '"]');
        if (row) UI._startRenameInline(file.id, row);
      }, 30);
    },

    newFolder(parentFolderId) {
      const parent = parentFolderId ? State.findNode(parentFolderId) : State.project;
      if (!parent) return;
      const folder = Filesystem.createFolder(parent ? parent.id : null);
      this.persistProject();
      UI.renderFileTree();
      setTimeout(() => {
        const row = document.querySelector('.tree-row[data-id="' + folder.id + '"]');
        if (row) UI._startRenameInline(folder.id, row);
      }, 30);
    },

    rename(nodeId) {
      return UI.promptRename(nodeId);
    },

    deleteItem(nodeId) {
      const node = State.findNode(nodeId);
      if (!node) return;
      if (node.id === State.project.id) return;

      // If file is open and dirty, show unsaved prompt? The spec says show delete confirmation.
      const isFolder = node.type === 'folder';
      const message = isFolder
        ? 'Delete "' + node.name + '"?\n\nAll files inside this folder will be deleted.\n\nThis cannot be undone.'
        : 'Delete "' + node.name + '"?\n\nThis cannot be undone.';
      UI.confirm(
        isFolder ? 'Delete folder?' : 'Delete file?',
        message,
        'Delete',
        () => {
          Filesystem.delete(nodeId);
          UI.renderFileTree();
          UI.renderTabs();
          UI.updateBreadcrumb();
          if (State.activeFileId) {
            Editor.openFile(State.activeFileId);
          } else {
            if (Editor.editor) {
              try { Editor.editor.setModel(null); } catch (_) {}
            }
            const empty = document.getElementById('editor-empty');
            if (empty) empty.hidden = false;
            UI.updateBreadcrumb();
          }
          this.persistProject();
          UI.toast('Deleted', 'success');
        },
        true
      );
    },

    closeActiveFile() {
      if (State.activeFileId) this.closeFile(State.activeFileId);
    },

    async closeFile(fileId) {
      const file = State.files.get(fileId);
      if (!file) return;
      if (State.isDirty(fileId)) {
        const action = await UI.unsavedChangesPrompt(file.name);
        if (action === 'cancel') return;
        if (action === 'save') {
          State.markSaved(fileId);
          await this.persistProject();
        }
      }
      // Save view state before closing.
      if (Editor.editor && State.activeFileId === fileId) {
        State.viewStates.set(fileId, Editor.editor.saveViewState());
      }
      State.openTabs = State.openTabs.filter((id) => id !== fileId);
      if (State.activeFileId === fileId) {
        const next = State.openTabs[State.openTabs.length - 1] || null;
        State.activeFileId = next;
        if (next) {
          Editor.openFile(next);
        } else {
          if (Editor.editor) {
            try { Editor.editor.setModel(null); } catch (_) {}
          }
          const empty = document.getElementById('editor-empty');
          if (empty) empty.hidden = false;
          UI.updateBreadcrumb();
        }
      }
      UI.renderTabs();
      UI.renderFileTree();
      this.persistState();
    },

    /* ---------------- Save / persistence ---------------- */
    save() {
      // Pull current editor content into state.
      if (Editor.editor) {
        const model = Editor.editor.getModel();
        if (model) {
          const file = State.files.get(State.activeFileId);
          if (file) file.content = model.getValue();
        }
      }
      State.markAllSaved();
      UI.updateSaveStatus('saving');
      UI.renderTabs();
      return Promise.all([this.persistProject(), this.persistState()]).then(() => {
        UI.updateSaveStatus('saved');
        UI.renderTabs();
      }).catch((e) => {
        UI.updateSaveStatus('error', e.message);
      });
    },

    scheduleAutoSave() {
      if (!this._autoSaveDebounced) {
        this._autoSaveDebounced = Utils.debounce(() => {
          if (!State.settings.autoSave) return;
          UI.updateSaveStatus('saving');
          // Sync editor content.
          if (Editor.editor) {
            const model = Editor.editor.getModel();
            if (model) {
              const file = State.files.get(State.activeFileId);
              if (file) file.content = model.getValue();
            }
          }
          State.markAllSaved();
          Promise.all([this.persistProject(), this.persistState()]).then(() => {
            UI.updateSaveStatus('saved');
            UI.renderTabs();
          }).catch(() => {
            UI.updateSaveStatus('error');
          });
        }, SAVE_DEBOUNCE_MS);
      }
      this._autoSaveDebounced();
    },

    /** Persist the project tree to IndexedDB. */
    persistProject() {
      return JSP.Storage.set(PROJECT_KEY, State.project);
    },

    /** Persist open-tab and active file metadata. */
    persistState() {
      return JSP.Storage.set(STATE_KEY, {
        openTabs: State.openTabs,
        activeFileId: State.activeFileId
      });
    },

    persistSettings() {
      JSP.Storage.saveSettingsSync(State.settings);
    },

    async loadFromStorage() {
      const stored = await JSP.Storage.get(PROJECT_KEY);
      const meta = await JSP.Storage.get(STATE_KEY);
      if (stored && typeof stored === 'object' && stored.children) {
        State.project = stored;
        State.indexFiles();
        if (meta && Array.isArray(meta.openTabs)) {
          // Filter tabs to those that still exist.
          State.openTabs = meta.openTabs.filter((id) => State.files.has(id));
        } else {
          State.openTabs = [];
        }
        if (meta && meta.activeFileId && State.files.has(meta.activeFileId)) {
          State.activeFileId = meta.activeFileId;
        } else if (State.openTabs.length > 0) {
          State.activeFileId = State.openTabs[0];
        } else {
          // open main.js if nothing else.
          const main = State.findFileByName('main.js');
          if (main) {
            State.openTabs = [main.id];
            State.activeFileId = main.id;
          }
        }
      } else {
        State.resetToDefaults();
      }
    },

    /* ---------------- Editor commands ---------------- */
    formatDocument() {
      if (!Editor.editor) return;
      Editor.formatDocument();
      UI.toast('Document formatted', 'success');
    },

    toggleSidebar(forceValue) {
      const main = document.querySelector('.app-main');
      let visible;
      if (typeof forceValue === 'boolean') {
        visible = forceValue;
      } else {
        visible = main.classList.contains('sidebar-hidden');
      }
      main.classList.toggle('sidebar-hidden', !visible);
      State.settings.sidebarVisible = visible;
      this.persistSettings();
      // Re-layout Monaco after the CSS transition.
      setTimeout(() => {
        if (Editor.editor) {
          try { Editor.editor.layout(); } catch (_) {}
        }
      }, 220);
    },

    togglePanel() {
      const ws = document.getElementById('workspace');
      const isHidden = ws.classList.toggle('console-hidden');
      // We don't persist "hidden" — the panel is visible by default on each load.
      // But its size is persisted, which is what the user expects.
      setTimeout(() => {
        if (Editor.editor) { try { Editor.editor.layout(); } catch (_) {} }
      }, 50);
      return !isHidden;
    },

    setPanelPosition(position) {
      if (position !== 'right' && position !== 'bottom') return;
      const ws = document.getElementById('workspace');
      ws.classList.toggle('panel-right', position === 'right');
      ws.classList.remove('console-hidden');
      State.settings.panelPosition = position;
      // Reset panel-size CSS variable to the saved dimension for that side.
      const size = position === 'right' ? (State.settings.panelWidth || 380) : (State.settings.panelHeight || 260);
      document.documentElement.style.setProperty('--panel-size', size + 'px');
      const btnBottom = document.getElementById('btn-dock-bottom');
      const btnRight = document.getElementById('btn-dock-right');
      if (btnBottom && btnRight) {
        btnBottom.hidden = position === 'bottom';
        btnRight.hidden = position === 'right';
      }
      const select = document.getElementById('set-panel-position');
      if (select) select.value = position;
      this.persistSettings();
      setTimeout(() => {
        if (Editor.editor) { try { Editor.editor.layout(); } catch (_) {} }
      }, 50);
    },

    toggleMinimap() {
      State.settings.minimap = !State.settings.minimap;
      document.getElementById('set-minimap').checked = State.settings.minimap;
      if (Editor.editor) Editor.applySettings();
      this.persistSettings();
      UI.toast('Minimap ' + (State.settings.minimap ? 'on' : 'off'), 'success');
    },

    toggleWordWrap() {
      State.settings.wordWrap = !State.settings.wordWrap;
      document.getElementById('set-word-wrap').checked = State.settings.wordWrap;
      if (Editor.editor) Editor.applySettings();
      this.persistSettings();
    },

    toggleAutoSave() {
      State.settings.autoSave = !State.settings.autoSave;
      document.getElementById('set-autosave').checked = State.settings.autoSave;
      this.persistSettings();
      UI.toast('Auto Save ' + (State.settings.autoSave ? 'on' : 'off'), 'success');
    },

    toggleTheme() {
      State.settings.theme = State.settings.theme === 'dark' ? 'light' : 'dark';
      UI.applyTheme();
      this.persistSettings();
      UI.toast('Theme: ' + State.settings.theme, 'success');
    },

    setTheme(theme) {
      if (theme !== 'dark' && theme !== 'light') return;
      State.settings.theme = theme;
      UI.applyTheme();
      this.persistSettings();
    },

    /* ---------------- Download / export / import ---------------- */
    downloadActiveFile() {
      const file = State.files.get(State.activeFileId);
      if (!file) { UI.toast('No file to download', 'warn'); return; }
      this.downloadFile(file.id);
    },

    downloadFile(fileId) {
      const file = State.files.get(fileId);
      if (!file) return;
      Utils.download(file.name, file.content || '', 'text/javascript');
      UI.toast('Downloaded ' + file.name, 'success');
    },

    async exportProject() {
      if (typeof JSZip === 'undefined') {
        UI.toast('ZIP library not available', 'error');
        return;
      }
      const zip = new JSZip();
      const files = Filesystem.toFileList();
      files.forEach((f) => zip.file(f.path, f.content));
      try {
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'js-playground-project.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        UI.toast('Project exported', 'success');
      } catch (e) {
        UI.toast('Export failed: ' + e.message, 'error');
      }
    },

    importProject() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.zip,application/zip';
      input.multiple = false;
      input.addEventListener('change', async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        if (typeof JSZip === 'undefined') {
          UI.toast('ZIP library not available', 'error');
          return;
        }
        try {
          const zip = await JSZip.loadAsync(file);
          const files = [];
          const entries = Object.keys(zip.files);
          for (const path of entries) {
            const entry = zip.files[path];
            if (entry.dir) continue;
            // Skip hidden and common non-JS files.
            const base = path.split('/').pop();
            if (base.startsWith('.') || base.endsWith('/')) continue;
            if (!/\.js$/i.test(base)) continue;
            const content = await entry.async('string');
            files.push({ path: path, content: content });
          }
          if (files.length === 0) {
            UI.toast('No .js files found in the ZIP.', 'error');
            return;
          }
          await Filesystem.importFileList(files);
          UI.renderFileTree();
          UI.renderTabs();
          UI.updateBreadcrumb();
          if (State.activeFileId) Editor.openFile(State.activeFileId);
          await this.persistProject();
          await this.persistState();
          UI.toast('Project imported (' + files.length + ' files)', 'success');
        } catch (e) {
          UI.toast('Import failed: ' + e.message, 'error');
        }
      });
      input.click();
    },

    /* ---------------- Reset ---------------- */
    confirmReset() {
      UI.confirm(
        'Reset project?',
        'This will replace all current files with the default examples. This cannot be undone.',
        'Reset',
        () => this.resetProject(),
        true
      );
    },

    async resetProject() {
      // Dispose existing models.
      for (const model of State.models.values()) {
        try { model.dispose(); } catch (_) {}
      }
      State.models.clear();
      State.viewStates.clear();
      State.resetToDefaults();
      UI.renderFileTree();
      UI.renderTabs();
      UI.updateBreadcrumb();
      if (State.activeFileId) Editor.openFile(State.activeFileId);
      await this.persistProject();
      await this.persistState();
      UI.toast('Project reset', 'success');
    }
  };

  JSP.Commands = Commands;
})(window);
