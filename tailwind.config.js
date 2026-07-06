/**
 * tailwind.config.js
 *
 * Enterprise Fleet Platform design tokens. Colors/spacing/radii are all
 * driven by CSS variables defined in app/globals.css so the same scale
 * works for light mode, dark mode, and automatic theme switching without
 * duplicating values here. This file only maps those variables into
 * Tailwind's utility namespace and adds the handful of platform-specific
 * scales (status colors, fleet chart palette, density-aware spacing)
 * that don't come from shadcn's default theme tokens.
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      screens: {
        print: { raw: 'print' },
        xs: '480px',
        '3xl': '1920px', // ultra-wide / large monitor support
      },
      colors: {
        // Core semantic surfaces (see :root / .dark in globals.css)
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        surface: 'var(--surface)',
        card: 'var(--card)',
        'card-foreground': 'var(--card-foreground)',
        popover: 'var(--popover)',
        'popover-foreground': 'var(--popover-foreground)',
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',

        // Brand
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
          50: 'var(--primary-50)',
          100: 'var(--primary-100)',
          200: 'var(--primary-200)',
          300: 'var(--primary-300)',
          400: 'var(--primary-400)',
          500: 'var(--primary-500)',
          600: 'var(--primary-600)',
          700: 'var(--primary-700)',
          800: 'var(--primary-800)',
          900: 'var(--primary-900)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },

        // Semantic status
        success: {
          DEFAULT: 'var(--success)',
          foreground: 'var(--success-foreground)',
          bg: 'var(--success-bg)',
          border: 'var(--success-border)',
        },
        warning: {
          DEFAULT: 'var(--warning)',
          foreground: 'var(--warning-foreground)',
          bg: 'var(--warning-bg)',
          border: 'var(--warning-border)',
        },
        danger: {
          DEFAULT: 'var(--danger)',
          foreground: 'var(--danger-foreground)',
          bg: 'var(--danger-bg)',
          border: 'var(--danger-border)',
        },
        info: {
          DEFAULT: 'var(--info)',
          foreground: 'var(--info-foreground)',
          bg: 'var(--info-bg)',
          border: 'var(--info-border)',
        },

        // Sidebar / nav
        sidebar: {
          DEFAULT: 'var(--sidebar)',
          foreground: 'var(--sidebar-foreground)',
          accent: 'var(--sidebar-accent)',
          'accent-foreground': 'var(--sidebar-accent-foreground)',
          border: 'var(--sidebar-border)',
          active: 'var(--sidebar-active)',
        },

        // Fleet/vehicle operational status (used for badges, map pins, timeline dots)
        fleet: {
          available: 'var(--fleet-available)',
          'in-service': 'var(--fleet-in-service)',
          maintenance: 'var(--fleet-maintenance)',
          'out-of-service': 'var(--fleet-out-of-service)',
          offline: 'var(--fleet-offline)',
          moving: 'var(--fleet-moving)',
          idle: 'var(--fleet-idle)',
        },

        // Chart series palette (order matters — used positionally)
        chart: {
          1: 'var(--chart-1)',
          2: 'var(--chart-2)',
          3: 'var(--chart-3)',
          4: 'var(--chart-4)',
          5: 'var(--chart-5)',
          6: 'var(--chart-6)',
        },
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius-md)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        full: '9999px',
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow-md)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        xl: 'var(--shadow-xl)',
        'focus-ring': '0 0 0 3px var(--ring-offset-shadow)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        // Enterprise dashboard type scale — tuned for information density
        // rather than marketing-page drama.
        display: ['2.25rem', { lineHeight: '2.5rem', letterSpacing: '-0.02em', fontWeight: '600' }],
        h1: ['1.75rem', { lineHeight: '2.25rem', letterSpacing: '-0.015em', fontWeight: '600' }],
        h2: ['1.375rem', { lineHeight: '1.875rem', letterSpacing: '-0.01em', fontWeight: '600' }],
        h3: ['1.125rem', { lineHeight: '1.625rem', fontWeight: '600' }],
        'section-title': ['0.8125rem', { lineHeight: '1.25rem', letterSpacing: '0.04em', fontWeight: '600' }],
        body: ['0.875rem', { lineHeight: '1.375rem', fontWeight: '400' }],
        'body-sm': ['0.8125rem', { lineHeight: '1.25rem', fontWeight: '400' }],
        caption: ['0.75rem', { lineHeight: '1.125rem', fontWeight: '400' }],
        label: ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.02em', fontWeight: '500' }],
        table: ['0.8125rem', { lineHeight: '1.25rem', fontWeight: '400' }],
        'table-num': ['0.8125rem', { lineHeight: '1.25rem', fontWeight: '500', fontFeatureSettings: '"tnum"' }],
      },
      spacing: {
        // Named density steps used across cards/tables/forms/drawers so
        // "compact" vs "comfortable" density modes stay consistent.
        'density-compact': '0.375rem',
        'density-comfortable': '0.625rem',
        18: '4.5rem',
        22: '5.5rem',
      },
      maxWidth: {
        'auth-card': '26rem',
        'form-narrow': '32rem',
        'form-wide': '48rem',
      },
      transitionDuration: {
        150: '150ms',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'slide-up': 'slide-up 200ms ease-out',
      },
    },
  },
  plugins: [],
};