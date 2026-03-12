import { component$, useSignal } from "eclipsa";

export default component$(() => {
  const count = useSignal(0)

  return <div>
    Hello World!
    <button type="button" onClick$={() => count.value++}>Count: {count.value}</button>
  </div>
})
