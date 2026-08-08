import type { NextConfig } from "next";
import webpack from "webpack";

const nextConfig: NextConfig = {
  typescript: {
    // `tsc --noEmit` is clean as of this change (all 18 real errors fixed).
    // Builds now fail on type errors instead of silently shipping them —
    // this is what let the trip-import 501 and the reporting param bug
    // reach production undetected before.
    ignoreBuildErrors: false,
  },
  eslint: {
    // ⚠️ Warn instead of error for ESLint errors during builds
    ignoreDuringBuilds: true,
  },
  webpack: (config) => {
    // Optional peer deps of @opentelemetry packages that we don't use
    // (Winston auto-instrumentation transport, Jaeger exporter). Without
    // this, webpack fails trying to resolve them even though they're only
    // required conditionally at runtime by the otel packages themselves.
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^@opentelemetry\/winston-transport$|^@opentelemetry\/exporter-jaeger$/,
      })
    );
    return config;
  },
};

export default nextConfig;