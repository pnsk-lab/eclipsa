import { useMountConnectedCanvas } from '../use-mount-connected-canvas.ts'

export default () => {
  const { canvasRef, mountState } = useMountConnectedCanvas()

  return (
    <div>
      <h1>Mount connected target</h1>
      <canvas data-testid="mount-connected-canvas" ref={canvasRef}></canvas>
      <p data-testid="mount-connected-state">{mountState.value}</p>
    </div>
  )
}
