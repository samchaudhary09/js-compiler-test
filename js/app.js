/* ============ app.js ============ */
(function (global) {
  'use strict';

  const JSP = global.JSP || (global.JSP = {});
  const { State, Storage, UI, Editor, Commands, Shortcuts, Utils } = JSP;

  async function boot() {
    // 1. Load settings (synchronous from localStorage) — apply before Monaco loads.
    const savedSettings = Storage.loadSettingsSync();
    if (savedSettings && typeof savedSettings === 'object') {
      Object.assign(State.settings, savedSettings);
    }
    // Apply body theme class immediately.
    document.body.classList.toggle('theme-dark', State.settings.theme === 'dark');
    document.body.classList.toggle('theme-light', State.settings.theme === 'light');

    // Sidebar visibility. On phones the Explorer is an on-demand drawer and
    // starts closed without changing the user's remembered desktop layout.
    if (!State.settings.sidebarVisible || window.innerWidth <= 768) {
      document.querySelector('.app-main').classList.add('sidebar-hidden');
    }

    // Minimap disabled on small screens.
    if (window.innerWidth <= 768) {
      document.body.classList.add('no-minimap');
    }

    // Apply panel position and size.
    const panelPosition = State.settings.panelPosition || 'right';
    const workspace = document.getElementById('workspace');
    if (workspace) {
      workspace.classList.toggle('panel-right', panelPosition === 'right');
    }
    const panelSize = panelPosition === 'right'
      ? (State.settings.panelWidth || 420)
      : (State.settings.panelHeight || 280);
    document.documentElement.style.setProperty('--panel-size', panelSize + 'px');
    document.documentElement.style.setProperty('--console-default-height', (State.settings.panelHeight || 280) + 'px');
    document.documentElement.style.setProperty('--console-default-width', (State.settings.panelWidth || 420) + 'px');
    const btnBottom = document.getElementById('btn-dock-bottom');
    const btnRight = document.getElementById('btn-dock-right');
    if (btnBottom && btnRight) {
      btnBottom.hidden = panelPosition === 'bottom';
      btnRight.hidden = panelPosition === 'right';
    }
    const panelSelect = document.getElementById('set-panel-position');
    if (panelSelect) panelSelect.value = panelPosition;

    // 2. Initialize UI (binds events etc.).
    UI.init();
    UI.updateIndentStatus();
    if (UI._updateKbdHints) UI._updateKbdHints();

    // 3. Open storage and load project.
    await Storage.open();
    try {
      await Commands.loadFromStorage();
    } catch (e) {
      console.error('Failed to load project from storage:', e);
      State.resetToDefaults();
    }

    // Mark all loaded files as saved on first boot.
    State.markAllSaved();

    // 4. Render UI.
    UI.renderFileTree();
    UI.renderTabs();
    UI.updateBreadcrumb();

    // 5. Welcome message in console.
    UI.appendConsole('system', 'Welcome to JS Playground! Open a file and press ' + (Utils.isMac() ? '⌘' : 'Ctrl') + '+Enter to run.');

    // 6. Initialize Monaco editor.
    const container = document.getElementById('editor-container');
    try {
      await Editor.init(container);
      if (Editor._fallbackTextarea) {
        UI.appendConsole('system', 'Monaco editor could not be loaded — using a basic editor. Run still works.');
      }
    } catch (e) {
      console.error('Editor failed to initialize:', e);
      UI.appendConsole('error', 'The code editor could not be loaded. Check your internet connection and reload.');
    }

    // 7. Initialize keyboard shortcuts.
    Shortcuts.init();

    State.ready = true;

    // 8. Warn the user if they try to leave with unsaved changes.
    window.addEventListener('beforeunload', (e) => {
      let dirty = false;
      for (const f of State.files.values()) {
        if (State.isDirty(f.id)) { dirty = true; break; }
      }
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    });

    // 9. Periodic full state save (cheap — IndexedDB only).
    setInterval(() => {
      if (State.ready) {
        Commands.persistState();
      }
    }, 10000);

    // For debugging / inspection.
    global.JSP = JSP;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
