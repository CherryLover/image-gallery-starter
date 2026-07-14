/**
 * One-shot migration: list Cloudinary images → download → prepare web JPEGs
 * (HEIC converted via macOS `sips`) → optionally upload to R2 → generate JSON.
 *
 * Usage:
 *   CLOUDINARY_CLOUD_NAME=xxx \
 *   CLOUDINARY_API_KEY=xxx \
 *   CLOUDINARY_API_SECRET=xxx \
 *   node scripts/migrate-from-cloudinary.mjs
 *
 * Options:
 *   --folder=skv          only this folder (default: skv; use * for all non-samples)
 *   --skip-upload         do not call wrangler r2 put
 *   --include-samples     keep Cloudinary sample assets
 *
 * Secrets must come from env — never commit them.
 */

import { createWriteStream, existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync, copyFileSync, statSync } from 'fs'
import { spawnSync } from 'child_process'
import https from 'https'
import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const cloudinary = require('cloudinary').v2

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const ORIG = path.join(ROOT, '.migration/originals')
const WEB = path.join(ROOT, '.migration/web')

const cloud_name = process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
const api_key = process.env.CLOUDINARY_API_KEY
const api_secret = process.env.CLOUDINARY_API_SECRET

const args = process.argv.slice(2)
const folderArg = (args.find((a) => a.startsWith('--folder=')) || '--folder=skv').split('=')[1]
const skipUpload = args.includes('--skip-upload')
const includeSamples = args.includes('--include-samples')

if (!cloud_name || !api_key || !api_secret) {
  console.error('Missing CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET')
  process.exit(1)
}

cloudinary.config({ cloud_name, api_key, api_secret, secure: true })

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest)
    const lib = url.startsWith('https') ? https : http
    const req = lib.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close()
        try { unlinkSync(dest) } catch {}
        return download(res.headers.location, dest).then(resolve, reject)
      }
      if (res.statusCode !== 200) {
        file.close()
        try { unlinkSync(dest) } catch {}
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
      }
      res.pipe(file)
      file.on('finish', () => file.close(() => resolve(dest)))
    })
    req.on('error', (e) => {
      file.close()
      try { unlinkSync(dest) } catch {}
      reject(e)
    })
  })
}

function safeName(publicId, format) {
  return publicId.replace(/\//g, '__') + '.' + format
}

function ensureDir(d) {
  mkdirSync(d, { recursive: true })
}

function cleanDir(d) {
  ensureDir(d)
  for (const f of readdirSync(d)) {
    unlinkSync(path.join(d, f))
  }
}

function isSample(publicId) {
  return (
    publicId.startsWith('samples/') ||
    publicId.startsWith('cld-sample') ||
    publicId === 'sample' ||
    publicId.includes('cloudinary')
  )
}

async function listAll() {
  let resources = []
  let next
  do {
    const res = await cloudinary.api.resources({
      type: 'upload',
      max_results: 500,
      next_cursor: next,
    })
    resources = resources.concat(res.resources || [])
    next = res.next_cursor
  } while (next)
  return resources
}

function toWebJpeg(srcPath, destPath) {
  const r = spawnSync(
    'sips',
    ['-s', 'format', 'jpeg', '-s', 'formatOptions', '90', srcPath, '--out', destPath],
    { encoding: 'utf8' }
  )
  if (r.status !== 0) {
    throw new Error(`sips failed for ${srcPath}: ${r.stderr || r.stdout}`)
  }
}

async function main() {
  console.log('Cloud:', cloud_name, 'folder filter:', folderArg)

  const all = await listAll()
  writeFileSync(path.join(ROOT, '.migration/cloudinary-list.json'), JSON.stringify(all, null, 2))
  console.log('Listed', all.length, 'assets')

  let selected = all
  if (folderArg && folderArg !== '*') {
    selected = all.filter((r) => r.public_id.startsWith(folderArg + '/') || r.public_id.startsWith(folderArg))
  }
  if (!includeSamples) {
    selected = selected.filter((r) => !isSample(r.public_id))
  }
  // drop tiny non-photo junk (e.g. logos under 5KB without folder)
  selected = selected.filter((r) => (r.bytes || 0) > 5000 || (r.width || 0) > 200)

  selected.sort((a, b) => (a.public_id < b.public_id ? 1 : a.public_id > b.public_id ? -1 : 0))
  console.log('Selected', selected.length)

  cleanDir(ORIG)
  cleanDir(WEB)

  const prepared = []
  for (let i = 0; i < selected.length; i++) {
    const r = selected[i]
    const format = r.format || 'jpg'
    const name = safeName(r.public_id, format)
    const dest = path.join(ORIG, name)
    const url = `https://res.cloudinary.com/${cloud_name}/image/upload/${r.public_id}.${format}`
    process.stdout.write(`[${i + 1}/${selected.length}] download ${name} ... `)
    try {
      await download(url, dest)
    } catch {
      await download(r.secure_url, dest)
    }
    console.log(statSync(dest).size)

    const base = r.public_id.split('/').pop()
    const webName = `${base}.jpg`
    const webPath = path.join(WEB, webName)
    if (format.toLowerCase() === 'jpg' || format.toLowerCase() === 'jpeg') {
      copyFileSync(dest, webPath)
    } else {
      toWebJpeg(dest, webPath)
    }
    prepared.push({
      public_id: r.public_id,
      filename: webName,
      source_format: format,
      bytes: statSync(webPath).size,
      width: r.width,
      height: r.height,
    })
  }

  writeFileSync(path.join(ROOT, '.migration/prepared.json'), JSON.stringify(prepared, null, 2))
  console.log('Prepared', prepared.length, 'web images in', WEB)

  if (!skipUpload) {
    for (const item of prepared) {
      const file = path.join(WEB, item.filename)
      console.log('R2 put gallery/' + item.filename)
      const up = spawnSync(
        'wrangler',
        [
          'r2',
          'object',
          'put',
          `s3-hono/gallery/${item.filename}`,
          '--file',
          file,
          '--content-type',
          'image/jpeg',
          '--remote',
        ],
        { stdio: 'inherit', encoding: 'utf8' }
      )
      if (up.status !== 0) {
        console.error('Upload failed for', item.filename)
        process.exit(1)
      }
    }
  } else {
    console.log('Skip R2 upload (--skip-upload)')
  }

  console.log('Generating data/images.json ...')
  const gen = spawnSync('python3', [path.join(ROOT, 'scripts/generate-images-json.py'), WEB], {
    stdio: 'inherit',
  })
  if (gen.status !== 0) process.exit(gen.status || 1)
  console.log('Done.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
