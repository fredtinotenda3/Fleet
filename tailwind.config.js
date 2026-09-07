/**
 * tailwind.config.js
 *
 * ############################################################################
 * # THIS FILE IS NOT LOADED. DO NOT ADD DESIGN TOKENS HERE.                  #
 * # The design tokens live in app/globals.css, in the `@theme inline` block. #
 * ############################################################################
 *
 * This project compiles CSS with Tailwind v4 via `@tailwindcss/postcss`
 * (see postcss.config.mjs) and `@import "tailwindcss"` in app/globals.css.
 *
 * Tailwind v4 ignores `tailwind.config.js` entirely unless the stylesheet
 * carries an explicit `@config "./tailwind.config.js"` directive. This
 * stylesheet has never had one.
 *
 * The consequence, discovered during the UI/UX overhaul audit and confirmed
 * by compiling a probe stylesheet with this repo's own tailwindcss binary:
 * every token that lived only in this file produced ZERO CSS in every build
 * the product has ever shipped. That included the whole type scale
 * (text-display/h1/h2/h3/section-title/body/body-sm/caption/label/table),
 * used 410 times across 132 files — so every heading, caption and label in
 * the application rendered at the inherited body size of 0.875rem/400.
 * The result looked like "inconsistent page design"; the actual cause was
 * that the typographic hierarchy did not exist at runtime.
 *
 * Those tokens have been ported to `@theme inline` in app/globals.css, which
 * is the v4-native location and the single source of truth. This file is
 * kept — rather than deleted — only so that this explanation sits where the
 * next engineer will look for the tokens.
 *
 * If you genuinely need a JS config (e.g. for a plugin that has no v4 CSS
 * equivalent), you must ALSO add `@config "../tailwind.config.js";` to
 * app/globals.css, and be aware that doing so changes token resolution for
 * the whole stylesheet. Prefer `@theme`.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  // Retained so editor tooling and the Tailwind IntelliSense extension can
  // still resolve a config file. Values here have no effect on the build.
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './frontend/**/*.{ts,tsx}',
    './shared/**/*.{ts,tsx}',
  ],
  theme: { extend: {} },
  plugins: [],
};
