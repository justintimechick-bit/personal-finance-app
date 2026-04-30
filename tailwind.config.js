/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Neutral surface scale — dark
        ink: {
          950: '#050505',
          900: '#0a0a0a',
          800: '#141414',
          700: '#1a1a1a',
          600: '#1f1f1f',
          500: '#262626',
          400: '#3f3f46',
          300: '#52525b',
          200: '#71717a',
          100: '#a1a1aa',
          50:  '#fafafa',
        },
        // Light-mode surface scale
        paper: {
          50:  '#fafaf9',
          100: '#f4f4f3',
          200: '#ebebea',
          300: '#deded9',
          400: '#d4d4d0',
        },
        accent: {
          DEFAULT: '#4ade80',
          dim:     '#22c55e',
          tint:    'rgba(74,222,128,0.10)',
        },
        warn:   '#f59e0b',
        danger: '#ef4444',
        info:   '#60a5fa',
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        'cell': '16px',
      },
    },
  },
  plugins: [],
};
