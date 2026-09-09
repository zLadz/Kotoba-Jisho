import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  agentRules: false,
  transpilePackages: ['@kotoba/types', '@kotoba/validation'],
};

export default nextConfig;
