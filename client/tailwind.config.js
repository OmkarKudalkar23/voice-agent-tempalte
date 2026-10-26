/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: "#05070E",
        darkCard: "#0B0F19",
        accentBlue: "#3B82F6",
        accentPurple: "#8B5CF6",
        accentCyan: "#06B6D4",
        accentPink: "#EC4899"
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 12s linear infinite',
      }
    },
  },
  plugins: [],
}
