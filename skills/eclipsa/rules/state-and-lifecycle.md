# State And Lifecycle

## Core Patterns

- Use `useSignal(initialValue)` for local reactive state.
- Read and write signal state through `.value`.
- Use `For` for list rendering.
- Use `onMount()` for client lifecycle setup.
- Use `useWatch()` when code should rerun in response to reactive reads.

## Example Shape

- Keep event handlers small and direct.
- Update signals from event handlers such as `onClick` or `onInput`.
- Prefer explicit state updates over hidden abstractions.

## Important Cautions

- Treat `useSignal` as a component-render API, not a general utility outside rendering.
- Keep signal values serializable unless the API explicitly supports a richer value.
- When rendering lists, use stable keys when identity matters.

## Good Fits

- Form input state
- Toggle state
- Counters
- Tabs
- Layout-owned active navigation UI
