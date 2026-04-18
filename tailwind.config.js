/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        'bg-0': '#03050d',
        'bg-1': '#070a16',
        'bg-2': '#0c1122',
        cyan: '#00e5ff',
        magenta: '#ff2dd1',
        violet: '#a855f7',
        amber: '#ffb347',
        danger: '#ff4d6d',
        success: '#58f5a0',
      },
      fontFamily: {
        display: ['Syncopate', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        sans: ['Manrope', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
