/** @type {import('next').NextConfig} */
const nextConfig = {
  // Don't generate AGENTS.md on `next dev`.
  agentRules: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
