import Image from 'next/image'
import { useEffect, useState } from 'react'

type FadeImageProps = {
  src: string
  alt: string
  width: number
  height: number
  /** Solid color under the soft blur mask */
  color?: string
  /** Tiny data-URL used as blurred mask while loading */
  blurDataUrl?: string
  /** Fade duration in ms */
  fadeMs?: number
  className?: string
  sizes?: string
  priority?: boolean
  /** Called after fade-in finishes */
  onRevealed?: () => void
}

/**
 * Hide progressive paint: keep photo invisible until fully loaded,
 * show a color + blurred mask, then fade the mask out.
 */
export default function FadeImage({
  src,
  alt,
  width,
  height,
  color = '#1a1a1a',
  blurDataUrl,
  fadeMs = 450,
  className = '',
  sizes,
  priority,
  onRevealed,
}: FadeImageProps) {
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setLoaded(false)
  }, [src])

  useEffect(() => {
    if (!loaded || !onRevealed) return
    const t = window.setTimeout(onRevealed, fadeMs)
    return () => window.clearTimeout(t)
  }, [loaded, fadeMs, onRevealed])

  return (
    <span
      className={`relative block overflow-hidden ${className}`}
      style={{ backgroundColor: color }}
    >
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes}
        priority={priority}
        className={`h-auto w-full transition-opacity ease-out ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ transitionDuration: `${fadeMs}ms` }}
        onLoadingComplete={() => setLoaded(true)}
      />

      {/* Soft mask: blur placeholder + color, fades away after load */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity ease-out"
        style={{
          opacity: loaded ? 0 : 1,
          transitionDuration: `${fadeMs}ms`,
          backgroundColor: color,
          backgroundImage: blurDataUrl ? `url(${blurDataUrl})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'blur(20px)',
          transform: 'scale(1.08)',
        }}
      />
    </span>
  )
}
