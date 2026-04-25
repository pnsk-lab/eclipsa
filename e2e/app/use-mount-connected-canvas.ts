import { onMount, useSignal } from 'eclipsa'

export const useMountConnectedCanvas = () => {
  const canvasRef = useSignal<HTMLCanvasElement | undefined>()
  const mountState = useSignal('pending')

  onMount(() => {
    const canvas = canvasRef.value
    mountState.value = canvas ? (canvas.isConnected ? 'connected' : 'detached') : 'missing'
    if (canvas) {
      canvas.width = 321
      canvas.height = 123
      canvas.dataset.mountedCanvas = 'true'
    }
  })

  return {
    canvasRef,
    mountState,
  }
}
