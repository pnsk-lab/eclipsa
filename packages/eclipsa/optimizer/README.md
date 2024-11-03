# eclipsa optimizer

eclipsa optimizer is a library for optimizing.

```tsx
// +page.tsx
export default component$(() => {
  const count = useSignal(0)
  return <button onClick$={(evt) => count.value ++}>
    Count: {count.value}
  </button>
})
```
To
```tsx
// +page_default.tsx
export default () => {
  const count = useSignal(0)
  const vars = {
    get count() { return count }
  }
  return <button
    onClick$={eurlFn('+page_default_onClick$.js', vars)}
  >
    Count: {count.value}
  </button>
}

// +page_default_onClick$.js
export default vars => evt => vars.count.value++
export const parentEurl = 'page_default.tsx'
export const depEurls = []
```
