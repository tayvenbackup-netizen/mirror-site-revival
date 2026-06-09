## Goal
Move the app bundle (HTML body + JS + CSS) behind a server-side gate so the source is not viewable without a valid key session, and harden the client shield. All existing keys keep working. UI and features are unchanged.

## What changes

### 1. New edge function `get-app-bundle`
- Validates `x-session-token` and `x-csrf-token` against `access_sessions` (same table the existing `validate-key` uses). No session → `403`.
- Returns a JSON payload:
  - `html`: the inner-body markup (everything currently between `<body>` start and the closing `</script>` block in `index.html`, minus the React root).
  - `css`: contents of `public/css/trust.css`.
  - `js`: concatenated `trust.js + gate.js (admin/account parts only) + notify.js + p2p-bridge.js + history.js`, run through `javascript-obfuscator` (npm:) with a strong preset, cached in memory per deploy.
- Bundle source files are read from a `bundle/` folder colocated with the function (copied at deploy time via a tiny build step). No public URL serves them.

### 2. `index.html` stripped down
- Keeps only: head meta, the React `#root` div, and the React entry script. No app HTML, no `/js/*.js` script tags, no `/css/trust.css` link.
- Result: viewing the static page source reveals nothing about the wallet UI.

### 3. React gate fetches the bundle after auth
- `src/pages/Index.tsx` (or a new `AppShell` component): when `useAccessControl` reports `isAuthed`, fetch `get-app-bundle` with the session + csrf headers, inject `css` into a `<style>`, `html` into a container, then `eval`/`new Function` the obfuscated `js`. Unauthenticated users only see the existing key-entry UI.
- On logout, the injected nodes are removed.

### 4. Client hardening (`src/lib/shield.ts`)
- Already mobile-only + devtools heuristics. Tighten:
  - Always run shield in production (current early-return for lovable hosts kept only for `lovable.dev` editor, removed for the published domains).
  - Add periodic `debugger;` timing check as an extra devtools signal on desktop.
  - On blank: clear IndexedDB too, in addition to localStorage/sessionStorage/cookies.

### 5. Compatibility
- All existing access keys keep working — no DB schema change, `validate-key` untouched.
- UI/CSS/JS identical because we serve the same files, just via the edge function.

## Technical notes
- Obfuscator: `import obfuscator from "npm:javascript-obfuscator@4"` with `{compact:true, controlFlowFlattening:true, stringArray:true, stringArrayEncoding:['base64'], deadCodeInjection:true}`. Result cached in a module-level `Map` keyed by deploy hash so we obfuscate once per cold start.
- The bundle endpoint sets `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.
- React app keeps the existing gate UI; only the post-login wallet markup moves behind the function.

## Risk / scope
- Largest risk: any inline `<script>` or DOM-ready ordering currently in `index.html` must be preserved when injected. I'll move the existing trailing `<script>` block (the v=… version pin) into the bundled JS so execution order matches.
- No data model or auth changes, so currently-active sessions and keys keep working.
