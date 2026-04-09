// Empty PostCSS config to prevent Vite from walking up to the Next.js
// postcss.config.mjs at the repo root (which uses @tailwindcss/postcss, a
// plugin Ponder's bundled Vite can't load).
export default {
  plugins: [],
};
