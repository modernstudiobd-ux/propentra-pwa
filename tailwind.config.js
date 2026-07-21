/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff', 100: '#dae8ff', 500: '#2f5fd8', 600: '#254bb0',
          700: '#1e3a8a', 800: '#172c6b', 900: '#101f4d'
        }
      }
    }
  },
  plugins: []
}
