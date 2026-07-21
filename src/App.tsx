import { useEffect, useRef } from 'react'
import { Game } from './game/game'

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const touchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!canvasRef.current || !touchRef.current) return
    const game = new Game(canvasRef.current, touchRef.current)
    game.start()
    return () => game.destroy()
  }, [])

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#16122e]">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full"
        style={{ touchAction: 'none' }}
      />
      <div ref={touchRef} className="pointer-events-none absolute inset-0" />
    </div>
  )
}
