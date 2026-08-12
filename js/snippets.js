/* ============ snippets.js ============ */
/**
 * JavaScript snippets for the Monaco editor. Each snippet is provided as a
 * LSP-style snippet string with tab stops ($1, $2, $0) and choices (${1|a,b|}).
 *
 * The completions are registered with Monaco and also exposed as a searchable
 * list for the "Insert Snippet" command.
 */
(function (global) {
  'use strict';

  const JSP = global.JSP || (global.JSP = {});

  /**
   * Snippet metadata:
   *  prefix  - what the user types to trigger it (can be array)
   *  label   - shown in IntelliSense
   *  detail  - short text after label
   *  docs    - longer Markdown documentation
   *  body    - LSP snippet string
   */
  const SNIPPETS = [
    // ---------- Console ----------
    {
      label: 'cl',
      detail: 'console.log',
      docs: 'Insert `console.log(...)`.',
      body: 'console.log($1);$0'
    },
    {
      label: 'cll',
      detail: 'console.log label + value',
      docs: 'Logs a label followed by a value (great for debugging variables).',
      body: 'console.log("${1:value}:", ${1:value});$0'
    },
    {
      label: 'ce',
      detail: 'console.error',
      docs: 'Insert `console.error(...)`.',
      body: 'console.error($1);$0'
    },
    {
      label: 'cw',
      detail: 'console.warn',
      docs: 'Insert `console.warn(...)`.',
      body: 'console.warn($1);$0'
    },
    {
      label: 'ci',
      detail: 'console.info',
      docs: 'Insert `console.info(...)`.',
      body: 'console.info($1);$0'
    },
    {
      label: 'cd',
      detail: 'console.debug',
      docs: 'Insert `console.debug(...)`.',
      body: 'console.debug($1);$0'
    },
    {
      label: 'ct',
      detail: 'console.table',
      docs: 'Insert `console.table(...)` — pretty-prints arrays/objects.',
      body: 'console.table($1);$0'
    },
    {
      label: 'cgr',
      detail: 'console.group / groupEnd',
      docs: 'Wrap indented console output in a group.',
      body: 'console.group("${1:group}");\n$0\nconsole.groupEnd();'
    },
    {
      label: 'ctime',
      detail: 'console.time / timeEnd',
      docs: 'Measure how long a block of code takes.',
      body: 'console.time("${1:label}");\n$0\nconsole.timeEnd("${1:label}");'
    },
    {
      label: 'cclear',
      detail: 'console.clear',
      docs: 'Clear the console.',
      body: 'console.clear();$0'
    },

    // ---------- Variables ----------
    { label: 'const',  detail: 'const declaration',  docs: 'Declare a constant.',  body: 'const ${1:name} = ${2:value};$0' },
    { label: 'let',    detail: 'let declaration',    docs: 'Declare a block-scoped variable.', body: 'let ${1:name} = ${2:value};$0' },
    { label: 'var',    detail: 'var declaration',    docs: 'Declare a function-scoped variable.', body: 'var ${1:name} = ${2:value};$0' },

    // ---------- Functions ----------
    {
      label: 'fn',
      detail: 'function declaration',
      docs: 'A named function declaration.',
      body: 'function ${1:name}(${2:params}) {\n\t$0\n}'
    },
    {
      label: 'afn',
      detail: 'arrow function',
      docs: 'An anonymous arrow function assigned to a const.',
      body: 'const ${1:name} = (${2:params}) => {\n\t$0\n};'
    },
    {
      label: 'afe',
      detail: 'arrow function expression',
      docs: 'A short arrow function expression (often used in callbacks).',
      body: '(${1:params}) => ${2:expression}$0'
    },
    {
      label: 'af',
      detail: 'async function',
      docs: 'An async function declaration.',
      body: 'async function ${1:name}(${2:params}) {\n\t$0\n}'
    },
    {
      label: 'aaf',
      detail: 'async arrow function',
      docs: 'An async arrow function assigned to a const.',
      body: 'const ${1:name} = async (${2:params}) => {\n\t$0\n};'
    },
    {
      label: 'ret',
      detail: 'return',
      docs: 'Return a value from a function.',
      body: 'return $0;'
    },

    // ---------- Control flow ----------
    {
      label: 'if',
      detail: 'if statement',
      docs: 'A plain `if` block.',
      body: 'if (${1:condition}) {\n\t$0\n}'
    },
    {
      label: 'ife',
      detail: 'if / else',
      docs: 'An `if`/`else` block.',
      body: 'if (${1:condition}) {\n\t$2\n} else {\n\t$0\n}'
    },
    {
      label: 'eif',
      detail: 'else if',
      docs: 'An `else if` clause (insert after an if).',
      body: 'else if (${1:condition}) {\n\t$0\n}'
    },
    {
      label: 'el',
      detail: 'else',
      docs: 'An `else` clause.',
      body: 'else {\n\t$0\n}'
    },
    {
      label: 'ter',
      detail: 'ternary',
      docs: 'A ternary expression.',
      body: '${1:condition} ? ${2:valueIfTrue} : ${0:valueIfFalse}'
    },
    {
      label: 'sw',
      detail: 'switch statement',
      docs: 'A switch statement with a default clause.',
      body: 'switch (${1:expression}) {\n\tcase ${2:value}:\n\t\t$0\n\t\tbreak;\n\tdefault:\n\t\tbreak;\n}'
    },
    {
      label: 'cas',
      detail: 'case clause',
      docs: 'A `case` inside a switch (includes break).',
      body: 'case ${1:value}:\n\t$0\n\tbreak;'
    },

    // ---------- Loops ----------
    {
      label: 'for',
      detail: 'for loop (index)',
      docs: 'A classic C-style `for` loop with an index.',
      body: 'for (let ${1:i} = 0; ${1:i} < ${2:array}.length; ${1:i}++) {\n\t$0\n}'
    },
    {
      label: 'fori',
      detail: 'for loop i < length',
      docs: 'Compact `for` loop using `array.length`.',
      body: 'for (let i = 0; i < ${1:array}.length; i++) {\n\tconst ${2:item} = ${1:array}[i];\n\t$0\n}'
    },
    {
      label: 'forof',
      detail: 'for...of',
      docs: 'Iterate over an iterable with `for...of`.',
      body: 'for (const ${1:item} of ${2:iterable}) {\n\t$0\n}'
    },
    {
      label: 'forin',
      detail: 'for...in',
      docs: 'Iterate object keys with `for...in`.',
      body: 'for (const ${1:key} in ${2:object}) {\n\t$0\n}'
    },
    {
      label: 'foreach',
      detail: 'Array.forEach',
      docs: 'Call `.forEach` on an array.',
      body: '${1:array}.forEach((${2:item}) => {\n\t$0\n});'
    },
    {
      label: 'map',
      detail: 'Array.map',
      docs: 'Transform each array item with `.map`.',
      body: '${1:array}.map((${2:item}) => ${0:expression});'
    },
    {
      label: 'filter',
      detail: 'Array.filter',
      docs: 'Keep items for which the predicate returns true.',
      body: '${1:array}.filter((${2:item}) => ${0:predicate});'
    },
    {
      label: 'reduce',
      detail: 'Array.reduce',
      docs: 'Reduce an array to a single value.',
      body: '${1:array}.reduce((${2:acc}, ${3:item}) => ${0:acc + item}, ${4:initial});'
    },
    {
      label: 'find',
      detail: 'Array.find',
      docs: 'Return the first item matching a predicate.',
      body: '${1:array}.find((${2:item}) => ${0:predicate});'
    },
    {
      label: 'some',
      detail: 'Array.some',
      docs: 'True if at least one item matches the predicate.',
      body: '${1:array}.some((${2:item}) => ${0:predicate});'
    },
    {
      label: 'every',
      detail: 'Array.every',
      docs: 'True if every item matches the predicate.',
      body: '${1:array}.every((${2:item}) => ${0:predicate});'
    },
    {
      label: 'wh',
      detail: 'while loop',
      docs: 'A `while` loop.',
      body: 'while (${1:condition}) {\n\t$0\n}'
    },
    {
      label: 'dowhile',
      detail: 'do...while',
      docs: 'A `do...while` loop (executes at least once).',
      body: 'do {\n\t$0\n} while (${1:condition});'
    },

    // ---------- Async ----------
    {
      label: 'prom',
      detail: 'new Promise',
      docs: 'Create a new Promise.',
      body: 'new Promise((resolve, reject) => {\n\t$0\n});'
    },
    {
      label: 'then',
      detail: 'Promise.then',
      docs: 'Attach a resolved/rejected handler.',
      body: '.then((${1:value}) => {\n\t$0\n})'
    },
    {
      label: 'catch',
      detail: 'Promise.catch',
      docs: 'Catch a rejected Promise.',
      body: '.catch((${1:err}) => {\n\t$0\n});'
    },
    {
      label: 'asynccall',
      detail: 'async IIFE',
      docs: 'Immediately-invoked async function — handy at the top level when you want await.',
      body: '(async () => {\n\t$0\n})();'
    },
    {
      label: 'wait',
      detail: 'await new Promise setTimeout',
      docs: 'Await a delay (useful in examples).',
      body: 'await new Promise((resolve) => setTimeout(resolve, ${1:1000}));$0'
    },
    {
      label: 'settimeout',
      detail: 'setTimeout',
      docs: 'Run code after a delay.',
      body: 'setTimeout(() => {\n\t$0\n}, ${1:1000});'
    },
    {
      label: 'setinterval',
      detail: 'setInterval',
      docs: 'Run code repeatedly on a timer.',
      body: 'setInterval(() => {\n\t$0\n}, ${1:1000});'
    },
    {
      label: 'try',
      detail: 'try / catch',
      docs: 'A `try...catch` block.',
      body: 'try {\n\t$0\n} catch (${1:err}) {\n\t\n}'
    },
    {
      label: 'tryf',
      detail: 'try / catch / finally',
      docs: 'A `try...catch...finally` block.',
      body: 'try {\n\t$1\n} catch (${2:err}) {\n\t\n} finally {\n\t$0\n}'
    },
    {
      label: 'throw',
      detail: 'throw new Error',
      docs: 'Throw an Error.',
      body: 'throw new Error("${1:message}");$0'
    },

    // ---------- Data structures ----------
    { label: 'arr',    detail: 'array literal',      docs: 'Create an array.',     body: 'const ${1:items} = [${0}];' },
    { label: 'obj',    detail: 'object literal',     docs: 'Create an object.',    body: 'const ${1:obj} = {\n\t$0\n};' },
    { label: 'map',    detail: 'new Map',            docs: 'Create a Map.',        body: 'const ${1:map} = new Map([\n\t[$0]\n]);' },
    { label: 'set',    detail: 'new Set',            docs: 'Create a Set.',        body: 'const ${1:set} = new Set([${0}]);' },
    {
      label: 'class',
      detail: 'class declaration',
      docs: 'Declare a class with a constructor.',
      body: 'class ${1:Name} {\n\tconstructor(${2:params}) {\n\t\t$0\n\t}\n}'
    },
    {
      label: 'ctor',
      detail: 'constructor',
      docs: 'Class constructor method.',
      body: 'constructor(${1:params}) {\n\t$0\n}'
    },
    {
      label: 'method',
      detail: 'class method',
      docs: 'A method inside a class or object literal.',
      body: '${1:name}(${2:params}) {\n\t$0\n}'
    },
    {
      label: 'get',
      detail: 'getter',
      docs: 'A getter property.',
      body: 'get ${1:name}() {\n\treturn $0;\n}'
    },
    {
      label: 'set',
      detail: 'setter',
      docs: 'A setter property.',
      body: 'set ${1:name}(${2:value}) {\n\t$0\n}'
    },

    // ---------- Destructuring ----------
    {
      label: 'dar',
      detail: 'destructure array',
      docs: 'Destructure values from an array.',
      body: 'const [${1:a}, ${2:b}] = ${0:array};'
    },
    {
      label: 'dob',
      detail: 'destructure object',
      docs: 'Destructure properties from an object.',
      body: 'const { ${1:prop} } = ${0:object};'
    },
    {
      label: 'darrename',
      detail: 'destructure + rename',
      docs: 'Destructure a property with a renamed local variable.',
      body: 'const { ${1:prop}: ${2:local} } = ${0:object};'
    },
    {
      label: 'sp',
      detail: 'spread',
      docs: 'Spread an array/object with `...`.',
      body: '...${1:iterable}$0'
    },
    {
      label: 'rest',
      detail: 'rest params',
      docs: 'Collect remaining arguments into an array.',
      body: '...${1:args}$0'
    },
    {
      label: 'tl',
      detail: 'template literal',
      docs: 'Insert a template literal (backticks + interpolation).',
      body: '`${1:string}${0}`'
    },

    // ---------- Imports / Exports (ES modules) ----------
    {
      label: 'imp',
      detail: 'import module',
      docs: 'Import a default export.',
      body: "import ${1:name} from '${0:module}';"
    },
    {
      label: 'imd',
      detail: 'import destructured',
      docs: 'Import named exports.',
      body: "import { $0 } from '${1:module}';"
    },
    {
      label: 'ima',
      detail: 'import * as',
      docs: 'Import a module namespace object.',
      body: "import * as ${1:name} from '${0:module}';"
    },
    {
      label: 'exp',
      detail: 'export default',
      docs: 'Export a value as the default export.',
      body: 'export default $0;'
    },
    {
      label: 'exn',
      detail: 'export named',
      docs: 'Declare and export a named binding.',
      body: 'export ${1:const} ${2:name} = ${0:value};'
    },
    {
      label: 'exf',
      detail: 'export function',
      docs: 'Declare and export a function.',
      body: 'export function ${1:name}(${2:params}) {\n\t$0\n}'
    },

    // ---------- Testing-ish ----------
    {
      label: 'desc',
      detail: 'describe block',
      docs: 'A test `describe` block (Jest/Mocha-style).',
      body: "describe('${1:suite}', () => {\n\t$0\n});"
    },
    {
      label: 'it',
      detail: 'it/test block',
      docs: 'A single test case.',
      body: "it('${1:should ...}', () => {\n\t$0\n});"
    },
    {
      label: 'exp_eq',
      detail: 'expect(...).toBe',
      docs: 'A simple equality assertion.',
      body: 'expect(${1:actual}).toBe(${0:expected});'
    }
  ];

  /** Register all snippets as Monaco JavaScript completions. */
  function register(monaco) {
    if (!monaco || !monaco.languages || !monaco.languages.registerCompletionItemProvider) return;
    monaco.languages.registerCompletionItemProvider('javascript', {
      triggerCharacters: ['.', '"', "'", '/', 'c', 'l', 'e', 'w', 'i', 'f', 'a', 'r', 's', 't', 'o', 'n', 'm', 'p', 'd', 'v', 'g', 'u', 'h'],
      provideCompletionItems: function (model, position) {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn
        };
        const suggestions = SNIPPETS.map((s) => {
          const prefixes = Array.isArray(s.prefix) ? s.prefix : [s.label];
          return {
            label: s.label,
            kind: monaco.languages.CompletionItemKind.Snippet,
            detail: 'JS snippet · ' + (s.detail || ''),
            documentation: { value: s.docs || '' },
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            insertText: s.body,
            range: range,
            sortText: '!' + s.label,   // snippets appear near the top
            filterText: prefixes.concat(s.detail ? s.detail.split(/\s+/) : []).join(' '),
            // Label details visible in the suggestion widget.
            labelDetails: { description: s.detail || '' }
          };
        });
        return { suggestions: suggestions };
      }
    });
  }

  /** Searchable list used by the "Insert Snippet" command. */
  function list() {
    return SNIPPETS.slice();
  }

  JSP.Snippets = {
    register: register,
    list: list,
    SNIPPETS: SNIPPETS
  };
})(window);
