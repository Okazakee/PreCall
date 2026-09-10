import { join } from "node:path";
import type { NextConfig } from "next";

/**
 * The example consumes the local `precall` package from the repository root instead of a
 * published copy, so Turbopack resolves modules from that root and the production output trace
 * includes the linked package.
 */
const repositoryRoot = join(__dirname, "..", "..");

const nextConfig: NextConfig = {
  outputFileTracingRoot: repositoryRoot,
  turbopack: { root: repositoryRoot },
};

export default nextConfig;
