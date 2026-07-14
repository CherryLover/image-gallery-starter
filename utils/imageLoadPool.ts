/**
 * Small concurrency pool for image downloads (thread-pool style).
 * At most N loads run at once; when one finishes the next queued job starts.
 */

type QueueItem = {
  id: number
  priority: number
  cancelled: boolean
  start: () => void
}

class ImageLoadPool {
  private maxConcurrent: number
  private active = 0
  private queue: QueueItem[] = []
  private seq = 0

  constructor(maxConcurrent = 3) {
    this.maxConcurrent = Math.max(1, maxConcurrent)
  }

  /** Change pool size at runtime if needed */
  setConcurrency(n: number) {
    this.maxConcurrent = Math.max(1, n)
    this.pump()
  }

  /**
   * Run work when a free slot is available.
   * Higher priority runs first among waiting jobs.
   * AbortSignal cancels a still-queued job (in-flight work should self-check signal).
   */
  run(
    work: (signal: AbortSignal) => Promise<void>,
    options: { priority?: number; signal?: AbortSignal } = {}
  ): Promise<void> {
    const priority = options.priority ?? 0
    const outer = options.signal

    return new Promise<void>((resolve, reject) => {
      if (outer?.aborted) {
        resolve()
        return
      }

      const controller = new AbortController()
      const onOuterAbort = () => controller.abort()
      outer?.addEventListener('abort', onOuterAbort)

      const item: QueueItem = {
        id: ++this.seq,
        priority,
        cancelled: false,
        start: () => {
          // slot already counted in active
          Promise.resolve()
            .then(async () => {
              if (item.cancelled || controller.signal.aborted) return
              await work(controller.signal)
            })
            .then(() => resolve())
            .catch((err) => {
              if (controller.signal.aborted || item.cancelled) resolve()
              else reject(err)
            })
            .finally(() => {
              outer?.removeEventListener('abort', onOuterAbort)
              this.active = Math.max(0, this.active - 1)
              this.pump()
            })
        },
      }

      const cancelQueued = () => {
        item.cancelled = true
        this.queue = this.queue.filter((q) => q.id !== item.id)
        outer?.removeEventListener('abort', onOuterAbort)
        resolve()
      }

      outer?.addEventListener('abort', cancelQueued, { once: true })

      this.queue.push(item)
      // higher priority first; stable by id for same priority
      this.queue.sort((a, b) => b.priority - a.priority || a.id - b.id)
      this.pump()
    })
  }

  private pump() {
    while (this.active < this.maxConcurrent && this.queue.length > 0) {
      const next = this.queue.shift()!
      if (next.cancelled) continue
      this.active += 1
      next.start()
    }
  }
}

/** Shared site-wide pool: 3 concurrent image loads */
export const imageLoadPool = new ImageLoadPool(3)

/** Preload a URL via HTMLImageElement under the pool */
export function loadImageWithPool(
  src: string,
  options: { priority?: number; signal?: AbortSignal } = {}
): Promise<void> {
  return imageLoadPool.run(
    (signal) =>
      new Promise<void>((resolve, reject) => {
        if (signal.aborted) {
          resolve()
          return
        }
        const img = new window.Image()
        const done = () => {
          img.onload = null
          img.onerror = null
          signal.removeEventListener('abort', onAbort)
        }
        const onAbort = () => {
          done()
          // stop decode work where possible
          img.src = ''
          resolve()
        }
        signal.addEventListener('abort', onAbort)
        img.onload = () => {
          done()
          resolve()
        }
        img.onerror = () => {
          done()
          reject(new Error(`Failed to load ${src}`))
        }
        img.decoding = 'async'
        img.src = src
      }),
    options
  )
}
