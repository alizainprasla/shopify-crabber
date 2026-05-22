/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        shopify: {
          green: '#008060',
          'green-dark': '#004c3f',
          'green-light': '#95bf47',
        },
      },
    },
  },
  plugins: [],
};
