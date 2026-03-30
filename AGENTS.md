# Eclipsa Workspace

This file applies to the whole repository.

## Overview

- `packages/eclipsa` is the framework package.
- `e2e` is the integration app used to verify dev, SSR, build, and resume behavior.
- `.contexts/` is reference-only. Do not copy code, tests, comments, names, or wire formats from it.

## Working Rules

- Prefer `bun` and workspace scripts from the repository root.
- Keep resumable behavior and DOM-compiled client behavior aligned. Avoid reintroducing route-level full-body hydration.
- You have to create a new test when you fix a bug or add a feature.
- This project is before alpha, so any breaking change is allowed.
- You have to remove dead code when you change a way to do something.
- Do not fear large-scale changes. If the change is a good one, it is welcomed. See it through to the end, regardless of the cost. Make changes that prioritize long-term costs over short-term ones.
- These rules can be broken if a user permits it.
- 極力 docs/e2e ではなくランタイムのバグとして直す。ドキュメント化されていないのにあきらかに React/Solid と同じノリで書いているのに動かないならフレームワークの問題、明らかに一般的なフレームワークで動かないまたは明文化されている禁じられた書き方をしているのなら docs/e2e の問題

## Common Commands

- `bun run dev`
- `bun run build`
- `bun run test`
- `bun run test:e2e`
- `bun typecheck`
