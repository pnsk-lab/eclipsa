# eclipsa compiler analyze

The analyze stage extracts resumable symbols and rewrites modules for the rest of the compiler pipeline.

Plain event handlers are supported when they are either inline functions, component-local function
declarations, or component-local `const` function values. Other event handler expressions fail at
compile time so resumability stays explicit.

```tsx
// +page.tsx
export default () => {
  const count = useSignal(0)
  return <button onClick={(evt) => count.value++}>Count: {count.value}</button>
})
```

To

```tsx
// +page_default.tsx
export default () => {
  const count = useSignal(0)
  const vars = {
    get count() {
      return count
    },
  }
  return <button onClick={eurlFn('+page_default_onClick.js', vars)}>Count: {count.value}</button>
}

// +page_default_onClick.js
export default (vars) => (evt) => vars.count.value++
export const parentEurl = 'page_default.tsx'
export const depEurls = []
```
