/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
      "./src/**/*.{js,jsx,ts,tsx}",
    ],
    theme: {
      extend: {
        backdropBlur: {
          xs: '2px',
        },
        colors: {
          // Professional industrial slate palette
          slate: {
            850: '#1e293b',
            950: '#020617',
          },
        },
        borderRadius: {
          '4xl': '2rem',
          '5xl': '3rem',
        },
        animation: {
          'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        }
      },
    },
    plugins: [],
  }