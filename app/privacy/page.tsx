// DEPRECATED — superseded by page.jsx in the same directory.
//
// Next.js App Router treats `page.tsx` and `page.jsx` in the same route
// folder as a build conflict. Delete this file from git:
//
//   git rm app/privacy/page.tsx
//   git rm app/terms/page.tsx
//   git commit -m "Drop deprecated privacy/terms .tsx (replaced by .jsx)"
//
// Until then, this file re-exports the .jsx version so at least the
// content stays correct if Next.js picks this one. The compliant
// content lives in ./page.jsx alongside this file.

export { default, metadata } from './page.jsx';
