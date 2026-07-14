/**
 * Serve static Next export from R2 prefix shutters-web/
 */
const PREFIX = 'shutters-web/'

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    let path = decodeURIComponent(url.pathname || '/')

    // Normalize
    if (path === '' || path === '/') {
      path = '/index.html'
    } else if (path.endsWith('/')) {
      path = path + 'index.html'
    }

    // Candidates to try in order
    const candidates = []
    const stripped = path.replace(/^\//, '')
    candidates.push(PREFIX + stripped)

    // /p/0 -> shutters-web/p/0/index.html
    if (!stripped.includes('.') && !stripped.endsWith('/index.html')) {
      candidates.push(PREFIX + stripped + '/index.html')
      candidates.push(PREFIX + stripped + '.html')
    }

    // /p/0.html style
    if (stripped.match(/^p\/\d+$/)) {
      candidates.push(PREFIX + stripped + '/index.html')
    }

    let obj = null
    let hitKey = null
    for (const key of candidates) {
      obj = await env.ASSETS.get(key)
      if (obj) {
        hitKey = key
        break
      }
    }

    if (!obj) {
      const notFound = await env.ASSETS.get(PREFIX + '404.html')
      if (notFound) {
        return new Response(notFound.body, {
          status: 404,
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'public, max-age=60',
            'x-served-by': 'shutters-gallery-worker',
          },
        })
      }
      return new Response('Not Found', {
        status: 404,
        headers: { 'x-served-by': 'shutters-gallery-worker' },
      })
    }

    const headers = new Headers()
    headers.set('content-type', contentType(hitKey))
    headers.set('cache-control', cacheControl(hitKey))
    headers.set('x-served-by', 'shutters-gallery-worker')
    if (obj.httpEtag) headers.set('etag', obj.httpEtag)
    return new Response(obj.body, { headers })
  },
}

function contentType(key) {
  const k = key.toLowerCase()
  if (k.endsWith('.html')) return 'text/html; charset=utf-8'
  if (k.endsWith('.js')) return 'application/javascript; charset=utf-8'
  if (k.endsWith('.css')) return 'text/css; charset=utf-8'
  if (k.endsWith('.json')) return 'application/json; charset=utf-8'
  if (k.endsWith('.png')) return 'image/png'
  if (k.endsWith('.jpg') || k.endsWith('.jpeg')) return 'image/jpeg'
  if (k.endsWith('.webp')) return 'image/webp'
  if (k.endsWith('.svg')) return 'image/svg+xml'
  if (k.endsWith('.ico')) return 'image/x-icon'
  if (k.endsWith('.woff2')) return 'font/woff2'
  if (k.endsWith('.txt')) return 'text/plain; charset=utf-8'
  if (k.endsWith('.map')) return 'application/json'
  return 'application/octet-stream'
}

function cacheControl(key) {
  if (key.includes('/_next/static/')) return 'public, max-age=31536000, immutable'
  if (key.endsWith('.html')) return 'public, max-age=60, must-revalidate'
  return 'public, max-age=86400'
}
