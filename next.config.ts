import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Force named imports from lucide-react to be rewritten as direct icon-file
  // imports so the bundler ships ONLY the icons we use, not all 1,943.
  //
  // Without this, a barrel import like `import { Home } from 'lucide-react'`
  // can pull the entire icon set into the bundle (~tens of MB) — which
  // tanks first-load performance.
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

  // Tell Next.js which packages are safe to optimize on the server too.
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
