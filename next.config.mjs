/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Le site vitrine statique vit dans /public. Seule la racine "/" a besoin d'une réécriture.
  async rewrites() {
    return {
      beforeFiles: [{ source: '/', destination: '/index.html' }],
    };
  },
  async headers() {
    return [
      { source: '/admin/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      { source: '/api/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex' }] },
    ];
  },
};
export default nextConfig;
