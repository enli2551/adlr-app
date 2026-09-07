/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Theme-aware: driven by CSS variables in src/index.css (data-theme on <html>).
        // "white" is remapped to the theme text color so the ~390 text-white/bg-white/
        // border-white usages auto-adapt (white on dark themes, dark on the light theme).
        white: 'rgb(var(--text) / <alpha-value>)',
        adlr: {
          black: 'rgb(var(--adlr-black) / <alpha-value>)',
          anthracite: 'rgb(var(--adlr-anthracite) / <alpha-value>)',
          gold: 'rgb(var(--adlr-gold) / <alpha-value>)',
          'gold-dim': 'rgb(var(--adlr-gold-dim) / <alpha-value>)',
          red: 'rgb(var(--adlr-red) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
