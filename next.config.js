/** @type {import('next').NextConfig} */
module.exports = {
  // Static export for Cloudflare Pages / any static host
  output: 'export',
  trailingSlash: true,
  images: {
    // next/image optimizer needs a Node server; R2 already serves full images
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 's3-store.flyooo.uk',
        pathname: '/gallery/**',
      },
    ],
  },
}
