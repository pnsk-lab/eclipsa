# Eclipsa Workspace

This file applies to the whole repository.

## Overview

- `packages/eclipsa` is the framework package.
- `example` is the integration app used to verify dev, SSR, build, and resume behavior.
- `.contexts/` is reference-only. Do not copy code, tests, comments, names, or wire formats from it.

## Working Rules

- Prefer `bun` and workspace scripts from the repository root.
- Do not edit generated output under `dist/`.
- Do not edit dependency contents under `node_modules/`.
- Keep resumable behavior and DOM-compiled client behavior aligned. Avoid reintroducing route-level full-body hydration.
- You have to create a new test when you fix a bug or add a feature.
- This project is before alpha, so any breaking change is allowed.
- You have to remove dead code when you change a way to do something.
- Do not fear large-scale changes. If the change is a good one, it is welcomed. See it through to the end, regardless of the cost. Make changes that prioritize long-term costs over short-term ones.
- These rules can be broken if a user permits it.

## Common Commands

- `bun run dev`
- `bun run build`
- `bun run test`
- `bun typecheck`

## Directory Guide

- `example/`: app-level verification target
- `packages/eclipsa/core/`: runtime, resume, signals, SSR payloads
- `packages/eclipsa/jsx/`: JSX object model and SSR-side rendering glue
- `packages/eclipsa/compiler/analyze/`: resumable symbol extraction and compile-time analysis
- `packages/eclipsa/compiler/client/`: client DOM code generation
- `packages/eclipsa/compiler/ssr/`: SSR JSX runtime code generation
- `packages/eclipsa/compiler/shared/`: compiler utilities shared across stages
- `packages/eclipsa/vite/`: dev server, symbol loading, build integration
