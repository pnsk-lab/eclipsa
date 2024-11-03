# JSX Optimizer

WIP!!
Improved from [transformers/dev-client](../../transformers/dev-client/)

Inspired from dom-expressions.

```jsx
export const Component = () => {
  const count = useSignal(0)
  return <div>
    Count: {count.value}
  </div>
}
```
is optimized to 
```ts
// SSR: <div>Count: <!-- e -->0<!-- /e --></div>
const template = createTemplate('<div>Count</div>')
export const Component = () => {
  const count = useSignal(0)

  return ((from?: HTMLDivElement) => {
    const elem = from ?? template()
    insert(elem, elem.childNodes[1], () => count.value)
    return elem
  })()
}
```
