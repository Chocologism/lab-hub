/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ['Merriweather', 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', 'Georgia', 'serif'],
      },
      colors: {
        brand: {
          50: '#f5f5f4',
          100: '#e7e5e4',
          500: '#78716c',
          800: '#292524',
          900: '#1c1917',
        }
      }
    },
  },
  plugins: [],
}
