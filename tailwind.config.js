/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef6ff', 100: '#dcedff', 500: '#0a84ff', 600: '#0070e0',
          700: '#0058b3', 800: '#0a1f33', 900: '#0d0d0f'
        }
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.25rem'
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.03)'
      }
    }
  },
  plugins: []
}
