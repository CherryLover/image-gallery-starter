module.exports = {
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 's3-store.flyooo.uk',
        pathname: '/gallery/**',
      },
    ],
  },
}
