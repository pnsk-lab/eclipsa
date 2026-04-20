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

## Concrete Component Example

```tsx
import { onMount, useSignal, useWatch } from 'eclipsa'

export default function NewsletterForm() {
  const email = useSignal('')
  const submitted = useSignal(false)
  const inputRef = useSignal<HTMLInputElement | undefined>()

  onMount(() => {
    inputRef.value?.focus()
  })

  useWatch(() => {
    if (submitted.value) {
      console.log(`submitted: ${email.value}`)
    }
  }, [submitted, email])

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        submitted.value = true
      }}
    >
      <input
        onInput={(event: InputEvent) => {
          email.value = (event.currentTarget as HTMLInputElement).value
          submitted.value = false
        }}
        ref={inputRef}
        value={email.value}
      />
      <button type="submit">Subscribe</button>
      <p>{submitted.value ? `Saved ${email.value}` : 'Waiting for submit'}</p>
    </form>
  )
}
```

## Important Cautions

- Treat `useSignal` as a component-render API, not a general utility outside rendering.
- Keep signal values serializable unless the API explicitly supports a richer value.
- When rendering lists, use stable keys when identity matters.
- Call `useSignal()` at the top level of the component body, not inside event handlers or nested helper functions.

## Good Fits

- Form input state
- Toggle state
- Counters
- Tabs
- Layout-owned active navigation UI
