import type { NextConfig } from 'next';
const config: NextConfig = {
  distDir:process.env.WEB_DIST_DIR || '.next',
  transpilePackages:['@beforeyou/contracts','@beforeyou/ui'],
  env:{NEXT_PUBLIC_APP_MODE:process.env.APP_MODE === 'demo' ? 'demo' : 'live'},
  poweredByHeader:false,
  devIndicators:false,
};
export default config;
