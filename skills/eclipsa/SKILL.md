---
name: eclipsa
description: Build and extend user-facing Eclipsa applications. Use when Codex needs to create a new Eclipsa project, scaffold or explain the `app/` file structure, implement routes and layouts, work with `useSignal`, `Link`, `useNavigate`, `loader()`, `action()`, metadata, middleware, SSR root files, resumable client boot, or validate a normal Eclipsa app created with `npm create eclipsa@latest`.
---

# Eclipsa

## Overview

Use this skill for normal Eclipsa app work from the app author's point of view. Focus on route files, layouts, state, data loading, actions, metadata, and resumable SSR. Prefer small working snippets over framework-internals explanations.

## Workflow

1. Start from the user's app goal, not from Eclipsa repository internals.
2. Map the request to the smallest useful rule set:
   - new app or starter confusion: `rules/getting-started.md` and `rules/project-creation.md`
   - route tree, layouts, special files: `rules/app-structure.md`
   - links, params, route groups, `useNavigate()`: `rules/routing-and-navigation.md`
   - `useSignal`, `useWatch`, `onMount`: `rules/state-and-lifecycle.md`
   - `loader()`, `action()`, validators, middleware: `rules/data-loading-and-actions.md`
   - `metadata`, `+ssr-root.tsx`, `+server-entry.ts`: `rules/metadata-and-server.md`
   - resume behavior and browser-only logic: `rules/resume-and-ssr.md`
   - app verification: `rules/validation.md`
3. Prefer generated-app conventions from `npm create eclipsa@latest`.
4. Give concrete snippets that fit directly into `app/` files.
5. Keep examples public-data-oriented, serializable, and SSR-safe.
6. When validating, use the commands that exist in a normal generated app.

## Common Requests

- "Create a new page or dashboard route": read `rules/app-structure.md`, then `rules/routing-and-navigation.md`.
- "Make a layout that keeps shared state while pages change": read `rules/app-structure.md` and `rules/state-and-lifecycle.md`.
- "Fetch data for a page or layout": read `rules/data-loading-and-actions.md`.
- "Handle a form submit or button-triggered mutation": read `rules/data-loading-and-actions.md`.
- "Set title, canonical URL, or social metadata": read `rules/metadata-and-server.md`.
- "Fix code that assumes client-only rendering": read `rules/resume-and-ssr.md`.
- "Check whether an app is wired correctly": read `rules/validation.md`.

## Hard Constraints

- Keep `loader()` and `action()` at module scope so the compiler can register them once.
- Call `useSignal()` at the top level of the component body, not inside nested callbacks or branches.
- Keep loader and action input or output serializable unless the API explicitly supports richer values.
- Keep `app/+client.dev.tsx` on `resumeContainer(document)`.
- Treat Eclipsa as SSR plus resume. Do not switch examples to route-level full-body hydration patterns.

## Rule Index

- Read `rules/getting-started.md` for setup, starter commands, and the default project shape.
- Read `rules/project-creation.md` for `npm create eclipsa@latest`, scaffold output, and starter maintenance.
- Read `rules/app-structure.md` for route conventions, entry files, and preferred component patterns.
- Read `rules/routing-and-navigation.md` for `+page.tsx`, `+layout.tsx`, params, `Link`, and `useNavigate()`.
- Read `rules/state-and-lifecycle.md` for `useSignal`, `For`, `onMount`, `useWatch`, and component patterns.
- Read `rules/data-loading-and-actions.md` for `loader()`, `action()`, validation, and middleware.
- Read `rules/metadata-and-server.md` for `metadata`, `+ssr-root.tsx`, `+server-entry.ts`, and Hono integration.
- Read `rules/resume-and-ssr.md` for resumability, `resumeContainer(document)`, and SSR-safe guidance.
- Read `rules/validation.md` for app-level validation and common commands.

## Default Tactics

- Prefer app code under `app/` and the generated starter conventions.
- Use `Link` for normal navigation and `useNavigate()` when navigation is driven by code.
- Keep loader and action input or output public and serializable.
- Keep `+client.dev.tsx` boot on `resumeContainer(document)`.
- Treat Eclipsa as resumable SSR, not as a full-client-hydration framework.
