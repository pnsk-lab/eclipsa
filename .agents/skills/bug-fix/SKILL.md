---
name: bug-fix
description: Fix Eclipsa bugs by reproducing them, adding permanent E2E regression tests before changing the implementation, and passing all tests. Use for bug reports, regressions, and broken behavior in this repository.
---

# Bug Fix

Follow these steps in order. Read the root and affected directories' `AGENTS.md` files before working.

## 1. Reproduce

- Reproduce the reported behavior on the unmodified implementation. Record the environment, exact command or user actions, expected behavior, and actual failure.
- Use the relevant dev, SSR, build, or resume path. Reduce the reproduction without removing the conditions that trigger the bug.
- If reproduction fails, investigate the missing conditions. Do not claim a speculative change fixes an unobserved bug.

## 2. Add and retain an E2E regression test

- Before changing the implementation, add an automated E2E test that performs the reproducing actions and asserts the expected observable behavior.
- Use the existing E2E harness and conventions. Add only the fixtures needed to expose the bug. Unit or integration tests may supplement, but do not replace, the E2E regression test.
- Run the new test against the unfixed implementation and confirm it fails because of the reported bug, not a broken fixture, missing dependency, or setup error. Record the failing command and assertion.
- Keep the new test after the fix. Do not delete any existing tests or test cases.
- Do not bypass failures by skipping or disabling tests, adding focused-only execution to the committed suite, excluding tests from discovery, weakening assertions, or changing expected results to accept the bug.

## 3. Fix and pass all tests

- Fix the root cause, following the repository's framework-versus-app guidance. Do not hide a framework regression with a docs or E2E app workaround.
- Run the new regression test again and confirm it passes with the same expected behavior.
- Run the full workspace test suite and full E2E suite from the repository root: `bun run test` and `bun run test:e2e`. A targeted test run alone is not sufficient.
- Run `vp lint`, `vp fmt`, and `vp run typecheck` as required by `AGENTS.md`, plus any additional applicable CI checks. Inspect formatting changes and rerun affected checks after subsequent edits.
- Resolve test failures while preserving test coverage. Do not mark the fix complete until all tests and required checks pass. If an environment or dependency blocker prevents execution, report the exact blocker and unverified checks; do not report them as passed.

## Completion evidence

Report the reproduction, the added E2E test, its failure before and success after the fix, the root-cause change, and the commands and results for the full suites and required checks.
