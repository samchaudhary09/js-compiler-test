/* ============ shortcuts.js ============ */
(function (global) {
  'use strict';

  const JSP = global.JSP || (global.JSP = {});
  const { State, Utils, UI, Commands, Editor, Filesystem, KeyBindings } = JSP;

  const Shortcuts = {
    init() {
      document.addEventListener('keydown', (e) => this.onKeyDown(e));
    },

    /**
     * Returns true if the event target is a form control that should own
     * its own typing (so we don't steal e.g. typing "s" in a search box).
     */
    _isTextField(target) {
      if (!target) return false;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (target.isContentEditable) return true;
      // Monaco editor itself has a textarea; we don't want global shortcuts
      // to double-fire because Monaco also handles them via its actions.
      if (target.closest && target.closest('.monaco-editor')) return true;
      return false;
    },

    onKeyDown(e) {
      // Let overlays handle their own Escape/Enter/etc.
      const overlaysOpen =
        (UI.dom && (
          !UI.dom.quickOpenOverlay.hidden ||
          !UI.dom.commandPaletteOverlay.hidden ||
          !UI.dom.settingsOverlay.hidden
        ));

      // Escape always closes topmost transient UI.
      if (e.key === 'Escape') {
        if (UI && UI.dom && !UI.dom.contextMenu.hidden) {
          UI.hideContextMenu();
          e.preventDefault();
          return;
        }
        if (UI && UI.closeMenu) UI.closeMenu();
      }

      if (KeyBindings) {
        const actionId = KeyBindings.matchEvent(e);
        if (actionId) {
          // Don't intercept when user is typing in a non-Monaco text field,
          // unless it's a modifier combo (which text fields don't usually need).
          const target = e.target;
          const inTextField = this._isTextField(target);
          const isMonaco = !!(target && target.closest && target.closest('.monaco-editor'));
          if (inTextField && !isMonaco) {
            // Allow Ctrl/Cmd combos in inputs too, but don't run editor-side actions.
            // Save, run, etc. are generally safe to allow globally.
          }
          if (this._handleAction(actionId, e)) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }
      }

      if (this._isTextField(e.target) && !overlaysOpen) return;

      // F2 on a focused tree row starts inline rename.
      if (e.key === 'F2' && document.activeElement && document.activeElement.closest('.tree-row')) {
        const row = document.activeElement.closest('.tree-row');
        if (row && row.dataset.id) {
          e.preventDefault();
          UI._startRenameInline(row.dataset.id, row);
          return;
        }
      }
    },

    /**
     * Run a resolved keybinding action. Returns true if it was handled (so the
     * caller can preventDefault the underlying event).
     */
    _handleAction(actionId, e) {
      switch (actionId) {
        case 'run':
          Commands.run('shortcut');
          return true;
        case 'save':
          Commands.save();
          return true;
        case 'newFile':
          Commands.newFile();
          return true;
        case 'closeFile':
          Commands.closeActiveFile();
          return true;
        case 'commandPalette':
          UI.openCommandPalette();
          return true;
        case 'quickOpen':
          UI.openQuickOpen();
          return true;
        case 'toggleSidebar':
          Commands.toggleSidebar();
          return true;
        case 'togglePanel':
          Commands.togglePanel();
          return true;
        case 'toggleMinimap':
          Commands.toggleMinimap();
          return true;
        case 'toggleWordWrap':
          Commands.toggleWordWrap();
          return true;
        case 'toggleTheme':
          Commands.toggleTheme();
          return true;
        case 'clearConsole':
          Commands.clearConsole();
          return true;
        case 'formatDocument':
          if (Editor.editor) {
            Editor.formatDocument();
            UI.toast('Document formatted', 'success');
          }
          return true;
        case 'settings':
          UI.openSettings();
          return true;
        case 'find':
          if (Editor.editor) {
            const a = Editor.editor.getAction('actions.find');
            if (a) a.run();
          }
          return true;
        case 'replace':
          if (Editor.editor) {
            const a = Editor.editor.getAction('editor.action.startFindReplaceAction');
            if (a) a.run();
          }
          return true;
      }
      return false;
    }
  };

  JSP.Shortcuts = Shortcuts;
})(window);
