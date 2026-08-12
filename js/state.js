/* ============ state.js ============ */
(function (global) {
  'use strict';

  const JSP = global.JSP || (global.JSP = {});

  const DEFAULT_SETTINGS = {
    theme: 'dark',
    fontSize: 15,
    fontFamily: 'JetBrains Mono',
    tabSize: 2,
    wordWrap: false,
    minimap: true,
    ligatures: true,
    lineNumbers: true,
    autoSave: true,
    confirmClose: true,
    restoreTabs: true,
    sidebarVisible: true,
    /** 'bottom' | 'right' | 'hidden' — where the console/problems panel is docked. */
    panelPosition: 'bottom',
    lastPanelPosition: 'bottom',
    panelHeight: 280,
    panelWidth: 420,
    explorerWidth: 252,
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

  const LEARNING_LIBRARY = [
    {
      name: 'BASICS',
      files: {
        'variables.js': [
          '// Variables: use const by default and let when a value must change.',
          'const learner = "Sam";',
          'let completedLessons = 2;',
          'completedLessons += 1;',
          '',
          'console.log({ learner, completedLessons });',
          ''
        ].join('\n'),
        'data-types.js': [
          'const examples = {',
          '  string: "JavaScript",',
          '  number: 42,',
          '  boolean: true,',
          '  nothing: null,',
          '  missing: undefined,',
          '  list: [1, 2, 3]',
          '};',
          '',
          'console.table(Object.entries(examples).map(([name, value]) => ({',
          '  name,',
          '  type: value === null ? "null" : typeof value',
          '})));',
          ''
        ].join('\n'),
        'operators.js': [
          'const price = 20;',
          'const quantity = 3;',
          'const total = price * quantity;',
          'const qualifiesForDiscount = total >= 50;',
          '',
          'console.log({ total, qualifiesForDiscount });',
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
        'loops.js': [
          'for (let step = 1; step <= 5; step += 1) {',
          '  console.log(`Step ${step}`);',
          '}',
          ''
        ].join('\n')
      }
    },
    {
      name: 'FUNCTIONS',
      files: {
        'functions.js': [
          'function add(a, b) {',
          '  return a + b;',
          '}',
          '',
          'console.log(add(10, 20));',
          ''
        ].join('\n'),
        'arrow-functions.js': [
          'const square = (number) => number * number;',
          'const numbers = [1, 2, 3, 4];',
          '',
          'console.log(numbers.map(square));',
          ''
        ].join('\n'),
        'scope.js': [
          'const course = "JavaScript";',
          '',
          'function describeLesson(topic) {',
          '  const message = `${course}: ${topic}`;',
          '  return message;',
          '}',
          '',
          'console.log(describeLesson("Scope"));',
          ''
        ].join('\n'),
        'callbacks.js': [
          'function calculate(a, b, operation) {',
          '  return operation(a, b);',
          '}',
          '',
          'const multiply = (a, b) => a * b;',
          'console.log(calculate(6, 7, multiply));',
          ''
        ].join('\n')
      }
    },
    {
      name: 'ARRAYS',
      files: {
        'foreach.js': [
          'const fruits = ["Apple", "Banana", "Mango"];',
          '',
          'fruits.forEach((fruit, index) => {',
          '  console.log(index, fruit);',
          '});',
          ''
        ].join('\n'),
        'map.js': [
          'const prices = [10, 20, 30];',
          'const pricesWithTax = prices.map((price) => price * 1.18);',
          '',
          'console.log(pricesWithTax);',
          ''
        ].join('\n'),
        'filter.js': [
          'const numbers = [3, 8, 11, 14, 19];',
          'const evenNumbers = numbers.filter((number) => number % 2 === 0);',
          '',
          'console.log(evenNumbers);',
          ''
        ].join('\n'),
        'reduce.js': [
          'const cart = [12, 8, 25];',
          'const total = cart.reduce((sum, price) => sum + price, 0);',
          '',
          'console.log(`Total: ${total}`);',
          ''
        ].join('\n'),
        'find.js': [
          'const users = [',
          '  { id: 1, name: "Sam" },',
          '  { id: 2, name: "Alex" }',
          '];',
          '',
          'console.log(users.find((user) => user.id === 2));',
          ''
        ].join('\n')
      }
    },
    {
      name: 'OBJECTS',
      files: {
        'objects.js': [
          'const user = {',
          '  name: "Alex",',
          '  age: 22,',
          '  skills: ["HTML", "CSS", "JavaScript"]',
          '};',
          '',
          'console.log(user);',
          ''
        ].join('\n'),
        'destructuring.js': [
          'const user = { name: "Sam", role: "Developer" };',
          'const { name, role } = user;',
          '',
          'console.log(`${name} is a ${role}.`);',
          ''
        ].join('\n'),
        'object-methods.js': [
          'const scores = { arrays: 9, objects: 8, async: 7 };',
          '',
          'console.log(Object.keys(scores));',
          'console.log(Object.values(scores));',
          'console.table(Object.entries(scores));',
          ''
        ].join('\n')
      }
    },
    {
      name: 'ASYNC',
      files: {
        'promises.js': [
          'const lesson = Promise.resolve("Promises complete");',
          '',
          'lesson.then((message) => {',
          '  console.log(message);',
          '});',
          ''
        ].join('\n'),
        'async-await.js': [
          'async function learnAsync() {',
          '  console.log("Starting...");',
          '  await new Promise((resolve) => setTimeout(resolve, 500));',
          '  console.log("Finished after the timer.");',
          '}',
          '',
          'learnAsync();',
          ''
        ].join('\n'),
        'timers.js': [
          'let tick = 0;',
          'const timer = setInterval(() => {',
          '  tick += 1;',
          '  console.log(`Tick ${tick}`);',
          '  if (tick === 3) clearInterval(timer);',
          '}, 300);',
          ''
        ].join('\n')
      }
    },
    {
      name: 'MODERN JAVASCRIPT',
      files: {
        'let-and-const.js': [
          'const language = "JavaScript";',
          'let level = 1;',
          'level += 1;',
          '',
          'console.log({ language, level });',
          ''
        ].join('\n'),
        'template-literals.js': [
          'const name = "Sam";',
          'const completed = 5;',
          '',
          'console.log(`${name} completed ${completed} exercises.`);',
          ''
        ].join('\n'),
        'spread.js': [
          'const basics = ["variables", "loops"];',
          'const topics = [...basics, "arrays", "objects"];',
          'const profile = { name: "Sam", level: 2 };',
          'const updated = { ...profile, level: 3 };',
          '',
          'console.log(topics, updated);',
          ''
        ].join('\n'),
        'rest.js': [
          'function sum(...numbers) {',
          '  return numbers.reduce((total, number) => total + number, 0);',
          '}',
          '',
          'console.log(sum(2, 4, 6, 8));',
          ''
        ].join('\n'),
        'modules.js': [
          '// Browser modules normally use export/import across separate files.',
          '// The Worker runs one active file at a time, so this runnable example',
          '// models a small module with an object.',
          'const math = {',
          '  add: (a, b) => a + b,',
          '  multiply: (a, b) => a * b',
          '};',
          '',
          'console.log(math.add(4, 5));',
          ''
        ].join('\n')
      }
    }
  ];

  // Backwards-compatible flat map used by integrations that referenced the
  // original examples collection.
  const EXAMPLES = LEARNING_LIBRARY.reduce((all, category) => {
    Object.assign(all, category.files);
    return all;
  }, {});

  function makeFile(name, content) {
    return {
      id: JSP.Utils.uid('file'),
      type: 'file',
      name: name,
      language: 'javascript',
      content: content
    };
  }

  function makeLearningCategories() {
    return LEARNING_LIBRARY.map((category) => ({
      id: JSP.Utils.uid('folder'),
      type: 'folder',
      name: category.name,
      expanded: category.name === 'BASICS',
      children: Object.keys(category.files).map((name) => makeFile(name, category.files[name]))
    }));
  }

  /** Build the default project tree. */
  function buildDefaultProject() {
    const U = JSP.Utils;
    return {
      id: 'root',
      type: 'folder',
      name: 'JS Playground',
      expanded: true,
      _learningLibraryVersion: 1,
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
          children: makeLearningCategories()
        }
      ]
    };
  }

  /**
   * Central application state.
   */
  const State = {
    version: 3,

    settings: Object.assign({}, DEFAULT_SETTINGS),

    project: null,
    files: new Map(),
    openTabs: [],
    activeFileId: null,
    /** Latest live Monaco diagnostics; Editor is the single source of truth. */
    diagnostics: [],
    /** Small, local-only execution log (newest first). */
    runHistory: [],
    outputMessages: [],
    activePanel: 'console',

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
    LEARNING_LIBRARY: LEARNING_LIBRARY,

    buildDefaultProject: buildDefaultProject,

    /** Add the categorized learning library once without replacing user files. */
    ensureLearningLibrary() {
      if (!this.project || this.project._learningLibraryVersion >= 1) return false;
      let examples = (this.project.children || []).find((node) => node.type === 'folder' && node.name.toLowerCase() === 'examples');
      if (!examples) {
        examples = { id: JSP.Utils.uid('folder'), type: 'folder', name: 'examples', expanded: true, children: [] };
        this.project.children = this.project.children || [];
        this.project.children.push(examples);
      }
      for (const template of makeLearningCategories()) {
        let category = (examples.children || []).find((node) => node.type === 'folder' && node.name.toLowerCase() === template.name.toLowerCase());
        if (!category) {
          examples.children.push(template);
          continue;
        }
        category.children = category.children || [];
        const names = new Set(category.children.map((node) => node.name.toLowerCase()));
        template.children.forEach((file) => {
          if (!names.has(file.name.toLowerCase())) category.children.push(file);
        });
      }
      this.project._learningLibraryVersion = 1;
      this.indexFiles();
      return true;
    },

    resetToDefaults() {
      this.project = buildDefaultProject();
      this.files = new Map();
      this.openTabs = [];
      this.activeFileId = null;
      this.diagnostics = [];
      this.outputMessages = [];
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
          if (!Object.prototype.hasOwnProperty.call(node, 'savedContent')) {
            node.savedContent = node.content == null ? '' : String(node.content);
          }
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
