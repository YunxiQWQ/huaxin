# Huaxin / 画芯

React + Vite + Tailwind CSS project exported from Figma Make and maintained locally.

The project is co-created by Yunxi (芸溪), Claude and Codex. Original source is MIT licensed; preserve third-party licenses and attribution. Product name: 画芯 / Huaxin. Existing `banxin-*` storage, cache, clipboard and project-format identifiers are retained for compatibility with local drafts and `.bxproj` files.

## Development Server

Check whether the local development server is running before starting one. Run `pnpm dev --host 127.0.0.1` when needed; the default port is 8443.

- Local preview: http://localhost:8443/
- Hot reload: Changes to source files are reflected immediately

## Project Structure

This is the canonical project structure. Start with task-relevant files below. Only follow imports or inspect other files when required, when a documented path is missing, or when the repository contradicts this guide.

- `src/main.tsx` - React entrypoint; imports `src/index.css` and mounts `src/App.tsx` into the `#root` element
- `src/App.tsx` - Primary application component and the usual starting point for UI work
- `src/index.css` - Global CSS entrypoint and Tailwind CSS v4 import
- `index.html` - Vite HTML shell containing the `#root` element and loading `src/main.tsx`
- `package.json` - Project dependencies and the Vite build, development, preview, and formatting scripts
- `vite.config.ts` - Vite configuration with React, Tailwind CSS v4, and Figma Make plugins plus the `@` alias for `src`
- `.mise.toml` - Toolchain versions for Node.js and pnpm

## Dependencies

- Runtime: React 19 and React DOM 19
- Styling: Tailwind CSS v4 with the `@tailwindcss/vite` plugin
- Build tooling: Vite 8, TypeScript 5.7, and `@vitejs/plugin-react`
- Formatting: oxfmt

## Local verification and repository handling

- Use the package manager pinned in `package.json` and `pnpm-lock.yaml`.
- Run `pnpm typecheck`, `pnpm build`, and checks appropriate to the changed behavior.
- Existing browser checks use an isolated profile under `artifacts/e2e`. They must not use the user's normal browser profile.
- Run `pnpm check:secrets` and `git diff --check` before committing.
- Keep generated builds, browser profiles, user projects and credentials out of Git.
- Add a remote or push only after the user explicitly says “推送吧”.

## Styling

This project uses **Tailwind CSS v4** through the `@tailwindcss/vite` plugin configured in `vite.config.ts`. `src/index.css` imports Tailwind with `@import 'tailwindcss';`. Use Tailwind utility classes directly in JSX and put global CSS or Tailwind v4 theme customization in `src/index.css`. This scaffold does not need a Tailwind config file or PostCSS config.

`src/main.tsx` imports `src/index.css`, so global font wiring belongs in `src/index.css`. Keep CSS `@import` statements first, then add any `@font-face` rules and font-family defaults there.

Tailwind emits utility classes in `@layer utilities`, and CSS outside any cascade layer overrides every layer regardless of specificity. Put global element styles, such as resets and defaults for `body`, headings, `button`, or `input`, inside `@layer base { ... }` so utility classes on those elements still apply. Tailwind's Preflight already applies `box-sizing: border-box`, removes default margins, and sets `font: inherit` on form controls, so do not repeat those rules.
