/* ============ state.js ============ */
(function (global) {
  'use strict';

  const JSP = global.JSP || (global.JSP = {});

  const DEFAULT_SETTINGS = {
    theme: 'dark',
    fontSize: 15,
    tabSize: 2,
    wordWrap: false,
    minimap: true,
    autoSave: true,
    sidebarVisible: true,
    /** 'bottom' | 'right' — where the console/problems panel is docked. */
    panelPosition: 'right',
    panelHeight: 260,
    panelWidth: 380,
    /** User-customized keybindings: action id -> chord string (e.g. "ctrl+shift+p"). */
    keybindings: {}
  };

  const DEFAULT_MAIN_JS = [
    '// Welcome to JS Playground!',
    '// Write JavaScript on the left, then click ▶ Run or press Ctrl/Cmd + Enter.',
    '',
    'console.log("Hello, JavaScript!");',
    '',
    'const name = "Developer";',
    'const age = 20;',
    '',
    'console.log("Name:", name);',
    'console.log("Age:", age);',
    '',
    'for (let i = 1; i <= 5; i++) {',
    '  console.log("Count:", i);',
    '}',
    ''
  ].join('\n');

  const EXAMPLES = {
    'hello.js': 'console.log("Hello, World!");\n',
    'variables.js': [
      'const name = "Sam";',
      'let age = 20;',
      '',
      'console.log("Name:", name);',
      'console.log("Age:", age);',
      ''
    ].join('\n'),
    'functions.js': [
      'function add(a, b) {',
      '  return a + b;',
      '}',
      '',
      'console.log(add(10, 20));',
      ''
    ].join('\n'),
    'arrays.js': [
      'const fruits = ["Apple", "Banana", "Mango"];',
      '',
      'fruits.forEach((fruit) => {',
      '  console.log(fruit);',
      '});',
      ''
    ].join('\n'),
    'objects.js': [
      'const user = {',
      '  name: "Alex",',
      '  age: 22,',
      '  role: "Developer"',
      '};',
      '',
      'console.log(user);',
      ''
    ].join('\n'),
    'loops.js': [
      'for (let i = 1; i <= 10; i++) {',
      '  console.log(i);',
      '}',
      ''
    ].join('\n'),
    'conditions.js': [
      'const score = 85;',
      '',
      'if (score >= 90) {',
      '  console.log("Excellent");',
      '} else if (score >= 60) {',
      '  console.log("Good job");',
      '} else {',
      '  console.log("Keep practicing");',
      '}',
      ''
    ].join('\n'),
    'es6.js': [
      'const numbers = [1, 2, 3, 4, 5];',
      '',
      'const doubled = numbers.map(number => number * 2);',
      '',
      'console.log(doubled);',
      ''
    ].join('\n'),
    'async.js': [
      'async function example() {',
      '  console.log("Starting...");',
      '',
      '  await new Promise(resolve => setTimeout(resolve, 1000));',
      '',
      '  console.log("Finished after 1 second.");',
      '}',
      '',
      'example();',
      ''
    ].join('\n')
  };

  /** Build the default project tree. */
  function buildDefaultProject() {
    const U = JSP.Utils;
    const examplesChildren = Object.keys(EXAMPLES).map((name) => ({
      id: U.uid('file'),
      type: 'file',
      name: name,
      language: 'javascript',
      content: EXAMPLES[name]
    }));
    return {
      id: 'root',
      type: 'folder',
      name: 'JS Playground',
      expanded: true,
      children: [
        {
          id: U.uid('file'),
          type: 'file',
          name: 'main.js',
          language: 'javascript',
          content: DEFAULT_MAIN_JS
        },
        {
          id: U.uid('folder'),
          type: 'folder',
          name: 'examples',
          expanded: true,
          children: examplesChildren
        }
      ]
    };
  }

  /**
   * Central application state.
   */
  const State = {
    version: 2,

    settings: Object.assign({}, DEFAULT_SETTINGS),

    project: null,
    files: new Map(),
    openTabs: [],
    activeFileId: null,

    editor: null,
    models: new Map(),
    viewStates: new Map(),

    running: false,
    currentWorker: null,
    runStartTime: 0,
    runTimeoutHandle: null,

    storage: null,
    saveTimer: null,
    ready: false,

    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    DEFAULT_MAIN_JS: DEFAULT_MAIN_JS,
    EXAMPLES: EXAMPLES,

    buildDefaultProject: buildDefaultProject,

    resetToDefaults() {
      this.project = buildDefaultProject();
      this.files = new Map();
      this.openTabs = [];
      this.activeFileId = null;
      this.indexFiles();
      const main = this.findFileByName('main.js');
      if (main) {
        this.openTabs.push(main.id);
        this.activeFileId = main.id;
      }
    },

    indexFiles() {
      this.files = new Map();
      const walk = (node) => {
        if (node.type === 'file') {
          node.language = node.language || 'javascript';
          this.files.set(node.id, node);
        } else if (Array.isArray(node.children)) {
          node.children.forEach(walk);
        }
      };
      if (this.project) walk(this.project);
    },

    findFileByName(name) {
      for (const f of this.files.values()) {
        if (f.name === name) return f;
      }
      return null;
    },

    findParent(nodeId) {
      let found = null;
      const walk = (folder) => {
        if (!folder.children) return;
        for (const child of folder.children) {
          if (child.id === nodeId) { found = folder; return; }
          if (child.type === 'folder') walk(child);
          if (found) return;
        }
      };
      walk(this.project);
      return found;
    },

    findNode(nodeId) {
      if (this.project && this.project.id === nodeId) return this.project;
      let found = null;
      const walk = (folder) => {
        if (!folder.children) return;
        for (const child of folder.children) {
          if (child.id === nodeId) { found = child; return; }
          if (child.type === 'folder') walk(child);
          if (found) return;
        }
      };
      walk(this.project);
      return found;
    },

    getPath(nodeId) {
      const parts = [];
      let current = this.findNode(nodeId);
      while (current && current.id !== 'root') {
        parts.unshift(current.name);
        current = this.findParent(current.id);
      }
      return parts.join('/');
    },

    isDirty(fileId) {
      const f = this.files.get(fileId);
      if (!f) return false;
      return f.savedContent !== undefined && f.content !== f.savedContent;
    },

    markSaved(fileId) {
      const f = this.files.get(fileId);
      if (!f) return;
      f.savedContent = f.content;
    },

    markAllSaved() {
      for (const f of this.files.values()) {
        f.savedContent = f.content;
      }
    }
  };

  JSP.State = State;
})(window);
