import withBundleAnalyzer from '@next/bundle-analyzer';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '52mb', // raise limit for batch ZIP uploads (default is 1MB)
    },
  },
};

// Run `ANALYZE=true npm run build` to open the bundle analysis report.
// Verify that OPENAI_API_KEY and any other server-only secrets are absent
// from all client-side chunks before deploying.
export default process.env.ANALYZE === 'true'
  ? withBundleAnalyzer({ enabled: true })(nextConfig)
  : nextConfig;
