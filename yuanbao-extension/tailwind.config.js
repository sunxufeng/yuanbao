/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#0b57d0',
          dark: '#083a8c',
        },
      },
    },
  },
  plugins: [],
};
