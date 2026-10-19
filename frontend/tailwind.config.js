/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          yellow: '#FFD700',
          dark: '#111827',
          card: '#1F2937',
          border: '#374151',
          text: '#9CA3AF',
        },
      },
    },
  },
  plugins: [],
}
