import type { NextConfig } from 'next';

/**
 * Proxy same-origin para a API: o navegador chama /backend/* e a Vercel
 * encaminha para API_PROXY_TARGET no servidor. Evita depender de CORS na API
 * e mantem a URL real da API fora do codigo do cliente.
 */
const API_PROXY_TARGET = (process.env.API_PROXY_TARGET ?? '').replace(/\/$/, '');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: {
    root: process.cwd(),
  },
  async rewrites() {
    return API_PROXY_TARGET ? [{ source: '/backend/:path*', destination: `${API_PROXY_TARGET}/:path*` }] : [];
  },
};

export default nextConfig;
