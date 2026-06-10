import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The gated product-download route reads files from /private-files at
  // runtime with fs. Vercel's serverless bundler only ships files it can
  // statically trace — this tells it to include the product files in the
  // /api/files function bundle.
  outputFileTracingIncludes: {
    "/api/files/[name]": ["./private-files/**/*"],
  },
  // Force named imports from lucide-react to be rewritten as direct icon-file
  // imports so the bundler ships ONLY the icons we use, not all 1,943.
  //
  // Without this, a barrel import like `import { Home } from 'lucide-react'`
  // can pull the entire icon set into the bundle (~tens of MB) — which
  // tanks first-load performance.
  //
  // NOTE: we deliberately do NOT also set
  // `experimental.optimizePackageImports: ["lucide-react"]`. That option does
  // the same tree-shaking job at a different layer, and on Next 16 the two
  // overlapping pipelines collided and produced a generic
  //   TypeError: The "path" argument must be of type string. Received undefined
  // during `next build`. Stick to ONE optimizer for lucide-react.
  modularizeImports: {
    "lucide-react": {
      transform: "lucide-react/dist/esm/icons/{{ kebabCase member }}",
      preventFullImport: true,
      // skipDefaultConversion MUST be false (default) here because each
      // per-icon file exports the icon as the DEFAULT export, not as a named
      // export. With skipDefaultConversion: true, `import { Zap } from ...`
      // stays as a named import and breaks since the icon files don't have
      // a named `Zap` export — they have `export default Zap`.
    },
  },
};

export default nextConfig;
