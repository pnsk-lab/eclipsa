---
name: eclipsa
description: Build and extend user-facing Eclipsa applications. Use when Codex needs to create a new Eclipsa project, scaffold or explain the `app/` file structure, implement pages and layouts, work with `useSignal`, `Link`, `useNavigate`, `loader()`, `action()`, metadata, middleware, SSR root files, resumable client boot, or validate a normal Eclipsa app created with `npm create eclipsa@latest`.
---

# Eclipsa

## Overview

Use this skill for Eclipsa app development from the end-user perspective. Focus on how to create and structure apps, how routing and reactivity work, and how to use Eclipsa's SSR and resumability model correctly.

## Workflow

1. Start from the user's app goal, not from Eclipsa repository internals.
2. Load only the rule files needed for the requested feature.
3. Prefer generated-app conventions from `npm create eclipsa@latest`.
4. Keep examples and recommendations app-oriented, serializable, and SSR-safe.
5. When validating, use the commands that exist in a normal generated app.

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
