/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.STATIC_EXPORT === 'true' ? 'export' : 'standalone',
  swcMinify: true,
  basePath: '/zentinelle',
  assetPrefix: '/zentinelle',
  trailingSlash: true,
  generateBuildId: async () => {
    return new Date().toISOString();
  },
  images: {
    domains: ['images.unsplash.com'],
    unoptimized: true,
  },
  reactStrictMode: true,
  crossOrigin: 'anonymous',
  env: {
    NEXT_PUBLIC_GQL_URL: process.env.NEXT_PUBLIC_GQL_URL,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },
  async redirects() {
    return [
      {
        source: '/',
        destination: '/agents/',
        permanent: false,
      },
    ];
  },
};

module.exports = nextConfig;
