/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  reactStrictMode: true,

  // Monorepo support
  transpilePackages: ['@repo/ui', '@repo/shared-types'],

  // Fix "workspace root may not be correct" + avoid scanning outside repo on Windows
  outputFileTracingRoot: path.join(__dirname, '..', '..'),

  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },
};

module.exports = nextConfig;
