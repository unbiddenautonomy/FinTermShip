/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#ecfdf3',
          100: '#d1fadf',
          400: '#32d583',
          500: '#12b76a',
          600: '#039855',
          700: '#027a48',
        },
      },
    },
  },
  plugins: [],
};
