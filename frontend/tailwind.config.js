/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        canvas: '#0f1419',
        panel: '#151b24',
        ink: '#0b1220',
      },
    },
  },
  plugins: [],
}
