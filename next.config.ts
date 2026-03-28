import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  serverExternalPackages: ['@libsql/client'],
  experimental: {
    serverMinification: false,
  },
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_AUTH_TOKEN: process.env.DATABASE_AUTH_TOKEN,
  },
  async redirects() {
    return [
      {
        source: '/public/tournaments/groups/:path*',
        destination: '/tournaments/groups/:path*',
        permanent: true,
      },
      {
        source: '/public/tournaments/:path*',
        destination: '/tournaments/:path*',
        permanent: true,
      },
      {
        source: '/tournaments/:id/join',
        destination: '/tournaments/:id/entry/join',
        permanent: true,
      },
      {
        source: '/tournaments/:id/withdrawal',
        destination: '/tournaments/:id/entry/withdrawal',
        permanent: true,
      },
      // 旧システム（rakusyo-go.com）のURL対応
      {
        source: '/tournaments',
        destination: '/',
        permanent: true,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'api.qrserver.com',
        port: '',
        pathname: '/v1/create-qr-code/**',
      },
    ],
  },
};

export default nextConfig;
