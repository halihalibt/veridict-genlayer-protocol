/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: '#06080D',
        slateChamber: '#0D121C',
        amberGold: '#F59E0B',
        cyanTrace: '#06B6D4',
        emeraldFinal: '#10B981',
        crimsonSlash: '#F43F5E',
      },
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        sans: ['Plus Jakarta Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      }
    },
  },
  plugins: [],
};
