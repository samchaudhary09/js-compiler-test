/* ============ filesystem.js ============ */
(function (global) {
  'use strict';

  const JSP = global.JSP || (global.JSP = {});
  const { Utils, State } = JSP;

  const INVALID_NAME_RE = /[\\/:*?"<>|\u0000-\u001f]/;

  const Filesystem = {
    /** Get sibling names in a folder. */
    siblingNames(folder) {
      return (folder.children || []).map((c) => c.name);
    },

    /** Create a new file under parentFolderId (or root if omitted). */
    createFile(parentFolderId, name) {
      const parent = parentFolderId ? State.findNode(parentFolderId) : State.project;
      if (!parent || parent.type !== 'folder') throw new Error('Invalid parent folder');
      const finalName = name || Utils.uniqueName('untitled.js', this.siblingNames(parent));
      const file = {
        id: Utils.uid('file'),
        type: 'file',
        name: finalName,
        language: 'javascript',
        content: '',
        savedContent: ''
      };
      parent.children = parent.children || [];
      parent.children.push(file);
      parent.expanded = true;
      State.files.set(file.id, file);
      return file;
    },

    /** Create a new folder under parentFolderId. */
    createFolder(parentFolderId, name) {
      const parent = parentFolderId ? State.findNode(parentFolderId) : State.project;
      if (!parent || parent.type !== 'folder') throw new Error('Invalid parent folder');
      const finalName = name || Utils.uniqueName('new-folder', this.siblingNames(parent));
      const folder = {
        id: Utils.uid('folder'),
        type: 'folder',
        name: finalName,
        expanded: true,
        children: []
      };
      parent.children = parent.children || [];
      parent.children.push(folder);
      parent.expanded = true;
      return folder;
    },

    /**
     * Rename a node. Validates empty / duplicate / invalid characters.
     * Returns { ok: true } or { ok: false, error: '...' }.
     */
    rename(nodeId, newName) {
      const rawName = String(newName == null ? '' : newName).trim();
      if (!rawName) return { ok: false, error: 'Name cannot be empty.' };
      if (INVALID_NAME_RE.test(rawName)) return { ok: false, error: 'Name contains invalid characters (\\ / : * ? " < > |).' };
      newName = rawName;

      const node = State.findNode(nodeId);
      if (!node) return { ok: false, error: 'Item not found.' };

      const parent = State.findParent(nodeId);
      if (parent) {
        const duplicate = (parent.children || []).some((c) => c.id !== nodeId && c.name.toLowerCase() === newName.toLowerCase());
        if (duplicate) return { ok: false, error: 'An item with this name already exists.' };
      }
      if (node.type === 'file') {
        if (!/\.(js|mjs|cjs|jsx)$/i.test(newName)) {
          return { ok: false, error: 'Only .js, .mjs, .cjs, or .jsx files are supported.' };
        }
        node.language = 'javascript';
      }
      const oldName = node.name;
      node.name = newName;
      return { ok: true, oldName: oldName };
    },

    /**
     * Delete a node and (if a folder) all descendants.
     * Closes related tabs if needed. Returns list of affected file IDs.
     */
    delete(nodeId) {
      const node = State.findNode(nodeId);
      if (!node) return [];
      if (node.id === State.project.id) return []; // never delete root
      const parent = State.findParent(nodeId);
      if (!parent) return [];

      // Collect all file ids that will be removed
      const affected = [];
      const collect = (n) => {
        if (n.type === 'file') affected.push(n.id);
        else (n.children || []).forEach(collect);
      };
      collect(node);

      // Remove from tree
      parent.children = (parent.children || []).filter((c) => c.id !== nodeId);

      // Remove from flat index and dispose models
      affected.forEach((fid) => {
        State.files.delete(fid);
        const model = State.models.get(fid);
        if (model) {
          try { model.dispose(); } catch (_) {}
          State.models.delete(fid);
        }
        State.viewStates.delete(fid);
      });

      // Remove any open tabs for these files
      State.openTabs = State.openTabs.filter((id) => !affected.includes(id));

      // If active was deleted, switch to another tab
      if (affected.includes(State.activeFileId)) {
        State.activeFileId = State.openTabs.length ? State.openTabs[State.openTabs.length - 1] : null;
      }
      return affected;
    },

    /** Toggle folder expanded/collapsed. */
    toggleExpand(nodeId, forceValue) {
      const node = State.findNode(nodeId);
      if (node && node.type === 'folder') {
        node.expanded = typeof forceValue === 'boolean' ? forceValue : !node.expanded;
      }
      return node ? node.expanded : false;
    },

    /** Collapse every folder recursively. */
    collapseAll() {
      const walk = (n) => {
        if (n.type === 'folder') {
          if (n.id !== 'root') n.expanded = false;
          (n.children || []).forEach(walk);
        }
      };
      walk(State.project);
    },

    /** Flatten tree to a list of files (for quick open etc.). */
    listFiles() {
      const result = [];
      const walk = (n, pathParts) => {
        if (n.type === 'file') {
          result.push({
            id: n.id,
            name: n.name,
            path: pathParts.concat(n.name).join('/'),
            node: n
          });
        } else if (n.type === 'folder') {
          (n.children || []).forEach((c) => walk(c, pathParts.concat(n.id === 'root' ? [] : n.name)));
        }
      };
      if (State.project) walk(State.project, []);
      return result;
    },

    /** Collect every file into a flat ZIP-friendly structure. */
    toFileList() {
      return this.listFiles().map((f) => ({
        path: f.path,
        content: f.node.content || ''
      }));
    },

    /**
     * Import a file list (paths + content) replacing the current project.
     * Used by Import Project.
     */
    async importFileList(files) {
      if (!Array.isArray(files)) throw new Error('Import data must be a file list.');
      if (files.length > 500) throw new Error('Import contains too many entries.');
      const normalized = [];
      const seen = new Set();
      const folderPaths = new Set();
      let totalBytes = 0;
      for (const item of files) {
        const path = String(item && item.path || '').replace(/\\/g, '/');
        const parts = path.split('/').filter(Boolean);
        const invalid = !parts.length || path.startsWith('/') || path.startsWith('~') || parts.length > 20 || parts.some((part) =>
          part === '.' || part === '..' || part.length > 120 || /[:*?"<>|\u0000-\u001f]/.test(part)
        );
        if (invalid) throw new Error('Import contains an unsafe or invalid path.');
        const fileName = parts[parts.length - 1];
        if (!/\.(js|mjs|cjs|jsx)$/i.test(fileName)) continue;
        const canonicalParts = parts.map((part) => part.toLowerCase());
        const canonical = canonicalParts.join('/');
        if (seen.has(canonical)) throw new Error('Import contains duplicate file paths.');
        if (folderPaths.has(canonical)) throw new Error('Import contains a file/folder path collision.');
        for (let i = 1; i < canonicalParts.length; i++) {
          const folderPath = canonicalParts.slice(0, i).join('/');
          if (seen.has(folderPath)) throw new Error('Import contains a file/folder path collision.');
          folderPaths.add(folderPath);
        }
        const content = String(item && item.content || '');
        totalBytes += new Blob([content]).size;
        if (totalBytes > 2 * 1024 * 1024) throw new Error('Import is larger than the 2 MB browser limit.');
        seen.add(canonical);
        normalized.push({ parts, content });
      }
      if (!normalized.length) throw new Error('Import does not contain a supported JavaScript file.');

      // Validate first, then replace the current project atomically.
      for (const model of State.models.values()) {
        try { model.dispose(); } catch (_) {}
      }
      State.models.clear();
      State.viewStates.clear();
      State.files = new Map();
      State.openTabs = [];
      State.activeFileId = null;
      State.project = {
        id: 'root',
        type: 'folder',
        name: 'JS Playground',
        expanded: true,
        _learningLibraryVersion: 1,
        children: []
      };

      normalized.sort((a, b) => a.parts.join('/').localeCompare(b.parts.join('/')));
      for (const item of normalized) {
        const parts = item.parts;
        let parent = State.project;
        for (let i = 0; i < parts.length - 1; i++) {
          const folderName = parts[i];
          let next = (parent.children || []).find((child) => child.type === 'folder' && child.name.toLowerCase() === folderName.toLowerCase());
          if (!next) {
            next = { id: Utils.uid('folder'), type: 'folder', name: folderName, expanded: true, children: [] };
            parent.children = parent.children || [];
            parent.children.push(next);
          }
          parent = next;
        }
        const file = {
          id: Utils.uid('file'),
          type: 'file',
          name: parts[parts.length - 1],
          language: 'javascript',
          content: item.content,
          savedContent: item.content
        };
        parent.children = parent.children || [];
        parent.children.push(file);
        State.files.set(file.id, file);
      }

      const first = State.files.values().next().value;
      State.openTabs.push(first.id);
      State.activeFileId = first.id;
    }
  };

  JSP.Filesystem = Filesystem;
})(window);
