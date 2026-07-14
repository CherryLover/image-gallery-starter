import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { loadImageWithPool } from '../utils/imageLoadPool'

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
  /**
   * High priority (modal / LCP): skip viewport wait and jump the queue.
   * Still goes through the concurrency pool.
   */
  priority?: boolean
  /** Called after fade-in finishes */
  onRevealed?: () => void
  /**
   * How early to start loading before entering the viewport (px).
   * Only used when priority is false.
   */
  rootMargin?: string
  /** Pool priority score; higher starts sooner among waiting jobs */
  loadPriority?: number
}

/**
 * Concurrency-limited image load + soft mask fade reveal.
 * - At most N images download at once (shared pool, default 3)
 * - Near-viewport items enqueue first (unless priority)
 * - Photo stays hidden until fully decoded; mask fades out
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
  priority = false,
  onRevealed,
  rootMargin = '240px 0px',
  loadPriority,
}: FadeImageProps) {
  const wrapRef = useRef<HTMLSpanElement>(null)
  const [inView, setInView] = useState(priority)
  const [readySrc, setReadySrc] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  // Reset when source changes
  useEffect(() => {
    setReadySrc(null)
    setLoaded(false)
    if (priority) setInView(true)
  }, [src, priority])

  // Viewport gate (skip when priority)
  useEffect(() => {
    if (priority) {
      setInView(true)
      return
    }
    const el = wrapRef.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true)
          io.disconnect()
        }
      },
      { root: null, rootMargin, threshold: 0.01 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [priority, rootMargin, src])

  // Enqueue load through the shared pool once near viewport
  useEffect(() => {
    if (!inView || !src) return

    const ac = new AbortController()
    const prio =
      loadPriority ??
      (priority ? 100 : 0)

    loadImageWithPool(src, { priority: prio, signal: ac.signal })
      .then(() => {
        if (ac.signal.aborted) return
        setReadySrc(src)
        setLoaded(true)
      })
      .catch(() => {
        // still try to show — browser may recover
        if (!ac.signal.aborted) {
          setReadySrc(src)
          setLoaded(true)
        }
      })

    return () => ac.abort()
  }, [inView, src, priority, loadPriority])

  useEffect(() => {
    if (!loaded || !onRevealed) return
    const t = window.setTimeout(onRevealed, fadeMs)
    return () => window.clearTimeout(t)
  }, [loaded, fadeMs, onRevealed])

  return (
    <span
      ref={wrapRef}
      className={`relative block overflow-hidden ${className}`}
      style={{
        backgroundColor: color,
        aspectRatio: `${width} / ${height}`,
      }}
    >
      {readySrc ? (
        <Image
          src={readySrc}
          alt={alt}
          width={width}
          height={height}
          sizes={sizes}
          // Already preloaded via pool; browser cache makes this instant
          priority={priority}
          className={`h-auto w-full transition-opacity ease-out ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ transitionDuration: `${fadeMs}ms` }}
        />
      ) : null}

      {/* Soft mask: color + blurred thumb, fades out after load */}
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
