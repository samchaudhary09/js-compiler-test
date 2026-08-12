# JS Playground

> **A lightweight browser-based JavaScript IDE for learning and practicing JavaScript.**

JS Playground is a static, fully-client-side coding playground that feels like a small VS Code. It uses the [Monaco Editor](https://microsoft.github.io/monaco-editor/) (the same editor that powers VS Code) for a professional editing experience and runs your JavaScript inside an isolated [Web Worker](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API) — all without a backend, API keys, or any external services.

**Write, Run & Practice JavaScript — entirely in your browser.**

---

## ✨ Features

### Editor (Monaco)
- Professional VS Code–style editing experience
- JavaScript syntax highlighting
- Real IntelliSense & autocomplete (`console.`, `Math.`, `JSON.`, `Array.`, etc.)
- User-defined symbol suggestions (`myVariable`, `calculateTotal`, ...)
- Parameter hints and hover documentation
- Real-time diagnostics (syntax and semantic errors/warnings)
- Bracket matching & bracket-pair colorization
- Auto-closing brackets and quotes
- Code folding
- Find & Replace (`Ctrl/Cmd+F`, `Ctrl/Cmd+H`)
- Minimap (toggle in Settings)
- Multi-cursor editing
- Word wrap, indentation guides, smooth scrolling
- Format Document (`Shift+Alt+F`)

### Virtual file system
- Nested folders with expand/collapse
- New File / New Folder (with duplicate-name handling)
- Inline Rename (`F2`)
- Delete (with confirmation)
- File tabs with close buttons and unsaved-change dots
- Multiple open files, preserved cursor/scroll when switching
- One Monaco model per file (editor is *not* destroyed when switching tabs)

### Persistence
- Project tree and file contents saved in **IndexedDB** (with a localStorage fallback)
- Open tabs and active file restored on refresh
- Settings (theme, font size, tab size, word wrap, minimap, auto-save) persisted
- Auto-save (debounced ~700ms after you stop typing)
- Manual Save (`Ctrl/Cmd+S`)

### Execution
- JavaScript runs in a dedicated, isolated **Web Worker** (never in the main page)
- User code cannot access the app's DOM, IndexedDB, localStorage, cookies, or internal state
- `console.log`, `info`, `warn`, `error`, `debug`, `table`, `time`, `timeEnd`, `assert`, `clear`
- Multiple arguments, readable output for objects/arrays/Map/Set/Date/RegExp
- Async/await, Promises, `setTimeout`/`setInterval` fully supported
- Runtime errors caught and displayed with name, message, and line when available
- **Infinite-loop protection**: synchronous code that runs longer than 5 seconds is terminated
- Stop button (`■ Stop`) terminates the worker immediately
- Execution time shown after each run

### Productivity
- Command Palette (`Ctrl/Cmd+Shift+P`)
- Quick Open file search (`Ctrl/Cmd+P`)
- Sidebar toggle (`Ctrl/Cmd+B`)
- Settings panel
- Dark and Light themes (with matching Monaco themes)
- Status bar showing language, encoding, indentation, cursor position, save state
- Problems panel listing Monaco diagnostics across all files
- Toast notifications
- Download active file
- **Export project as ZIP** and **Import project from ZIP** (powered by JSZip)

### Accessibility & Responsiveness
- Semantic HTML5 (`<header>`, `<main>`, `<aside>`, `<nav>`, `<footer>`, `<dialog>`, etc.)
- Keyboard navigation throughout (file tree, tabs, menus, command palette)
- ARIA labels and roles
- Visible focus rings
- Responsive layout — sidebar becomes a drawer on mobile; minimap auto-hides on small screens
- Respects `prefers-reduced-motion`

---

## 🧱 Technology

- **HTML5 + CSS3 + vanilla JavaScript (ES2020+)** — no framework
- **Monaco Editor 0.45.0** (via versioned jsDelivr CDN)
- **JSZip 3.10.1** (via versioned jsDelivr CDN) for ZIP export/import
- **Web Workers** for sandboxed code execution
- **IndexedDB** (with localStorage fallback) for persistence
- CSS custom properties, Grid, and Flexbox for layout

There is **no build step** and **no server-side runtime**. The same files you edit are the files you host.

---

## 📁 Project architecture

```
js-playground/
├── index.html              # App shell
├── README.md
├── LICENSE
├── css/
│   ├── reset.css
│   ├── variables.css       # Design tokens (dark/light themes)
│   ├── layout.css          # Grid/flex layout of header/sidebar/editor/console/statusbar
│   ├── components.css      # Buttons, menus, dialogs, toasts, tabs...
│   └── responsive.css      # Media queries
├── js/
│   ├── app.js              # Bootstrap / startup
│   ├── state.js            # In-memory state + default project
│   ├── storage.js          # IndexedDB wrapper (+ localStorage fallback)
│   ├── filesystem.js       # Virtual FS (create/rename/delete/tree traversal)
│   ├── editor.js           # Monaco setup, models, actions, settings
│   ├── execution.js        # Web Worker lifecycle, timeouts, run/stop
│   ├── ui.js               # DOM rendering (tree, tabs, console, menus, dialogs)
│   ├── commands.js         # All user commands + persistence orchestration
│   ├── shortcuts.js        # Global keyboard shortcuts
│   └── utils.js            # Helpers (debounce, uniqueId, formatValue, ...)
├── workers/
│   └── javascript-worker.js # Sandboxed JS runtime
├── examples/               # On-disk copies of the bundled examples
└── assets/                 # Placeholder for static assets
```

### Module overview
Each `js/*.js` file attaches its public API to a single global `JSP` namespace
(e.g. `JSP.Editor`, `JSP.Commands`). This keeps the code modular while letting
the app run from `file://` or any static host without an ES-module bundler.

---

## 🚀 Local setup

Because the app loads a Web Worker, you should serve the folder over HTTP
rather than double-clicking `index.html` (most browsers block workers from
`file://` URLs).

Any static file server works. A few options:

```bash
# Python 3
python3 -m http.server 8080

# Node (npx)
npx --yes serve .

# PHP
php -S localhost:8080
```

Then open <http://localhost:8080> in your browser.

---

## 🌐 Deploying to GitHub Pages

1. Push this repository to GitHub.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment → Branch**, choose `main` and the folder
   containing `index.html` (typically `/root`).
4. Save. GitHub will give you a URL such as
   `https://<username>.github.io/<repository>/`.

All asset paths are relative (`./css/...`, `./js/...`, `./workers/...`), and
Monaco's worker URLs are generated at runtime from a versioned CDN, so the
app works whether it is hosted at the root of a domain or inside a
repository subdirectory.

> You don't need any secret keys, environment variables, or backend services.

---

## ⌨️ Keyboard shortcuts

| Action | Shortcut |
| --- | --- |
| Run code | `Ctrl/Cmd + Enter` |
| Save | `Ctrl/Cmd + S` |
| Command Palette | `Ctrl/Cmd + Shift + P` |
| Quick Open | `Ctrl/Cmd + P` |
| Toggle Sidebar | `Ctrl/Cmd + B` |
| New File | `Ctrl/Cmd + N` |
| Close File | `Ctrl/Cmd + W` |
| Find | `Ctrl/Cmd + F` |
| Replace | `Ctrl/Cmd + H` |
| Format Document | `Shift + Alt + F` |
| Settings | `Ctrl/Cmd + ,` |

Monaco also provides its usual bindings: multi-cursor (`Ctrl/Cmd+D`),
go to definition, rename symbol, etc.

---

## 🔐 Privacy and security

- **Your code never leaves the browser.** It is stored locally in IndexedDB
  and executed inside a Web Worker.
- The worker has no access to the application's DOM, cookies, IndexedDB,
  localStorage, or the parent window.
- Network access from user code (e.g. `fetch`) is governed by the browser's
  normal same-origin/CORS rules. The application itself does not call any
  analytics or telemetry endpoints.
- Monaco and JSZip are loaded from a pinned version on the jsDelivr CDN. If
  you need a fully offline deployment, you can vendor those files locally
  and adjust the URLs in `index.html` and `js/editor.js`.

> **Note:** A Web Worker is a strong sandbox for preventing accidental
> interference with the host app, but it is not a hardened security
> boundary for running actively malicious code. Don't paste untrusted code
> that you wouldn't feel comfortable running in a normal browser tab.

---

## ⚠️ Limitations

- Because code runs in a Web Worker, there is no `document`, `window` DOM,
  or access to the host page. This is intentional — it keeps the IDE safe
  from the code it runs. Common browser globals like `setTimeout`,
  `setInterval`, `console`, `atob`, `btoa`, `URL`, and `URLSearchParams`
  are available.
- The 5-second limit is a *synchronous inactivity* watchdog. A program that
  `await`s a long `setTimeout` (like the bundled `async.js` example) is
  allowed; only a tight loop that never yields to the event loop is killed.
- Only JavaScript (`.js`, `.mjs`, `.cjs`, `.jsx`) files are advertised for
  editing.
- TypeScript is not supported as a first-class language, but Monaco's JS
  language service provides rich IntelliSense for JavaScript.

---

## 🎓 Educational purpose

JS Playground is an independent educational project for practicing
JavaScript in the browser. It is **not** affiliated with or endorsed by
Microsoft or Visual Studio Code. "JavaScript" is a trademark of Oracle
and/or its affiliates; this project is an independent tool.

---

## 📄 License

MIT — see [LICENSE](./LICENSE).
