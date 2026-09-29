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
  // pdfkit resolves its built-in AFM font metrics (Helvetica, etc.) at
  // runtime via fs.readFileSync(path.join(__dirname, 'data', '*.afm')).
  // That only works when pdfkit is required normally out of
  // node_modules. Left to the default bundling, both Turbopack (`next
  // dev --turbopack`) and webpack (`next build`) inline pdfkit's code
  // into the route handler's bundle, which rewrites __dirname to a
  // synthetic bundle path with no 'data' folder next to it -- so the
  // very first .font(...) call throws ENOENT for Helvetica.afm. Listing
  // pdfkit here keeps it external (a normal require against the real
  // node_modules/pdfkit on disk) for every server route that uses it:
  // fuel-intelligence-pdf.generator.ts (the one that surfaced this),
  // plus esg-pdf.generator.ts, ledger-pdf.generator.ts, and
  // pdf-report.generator.ts, which depend on the exact same pdfkit
  // internals and were latently exposed to the same bug.
  serverExternalPackages: ['pdfkit'],
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