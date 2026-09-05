import { onMount } from 'eclipsa'

export default () => {
  onMount(() => {
    const element = document.querySelector('[data-testid="mount-only-state"]')!
    element.textContent = 'mounted'
  })
  return <p data-testid="mount-only-state">waiting</p>
}
