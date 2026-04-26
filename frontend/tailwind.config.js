/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontSize: {
        base: ["1.05rem", "1.6rem"],
        lg: ["1.2rem", "1.7rem"],
        xl: ["1.35rem", "1.8rem"]
      }
    }
  },
  plugins: []
};
