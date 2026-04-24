/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          900: '#0b0f14',
          800: '#121821',
          700: '#1a2230',
          600: '#232c3d',
          500: '#2c3750',
          400: '#4a5568',
          300: '#718096',
          200: '#a0aec0',
          100: '#cbd5e0',
          50: '#e2e8f0',
        },
        accent: {
          DEFAULT: '#4ade80',
          dim: '#22c55e',
        },
        warn: '#f59e0b',
        danger: '#ef4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
