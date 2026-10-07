/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F4F8F5",
        ink: "#14231F",
        muted: "#4E625B",
        line: "#D3E0D8",
        pine: { DEFAULT: "#12372F", soft: "#1D5246" },
        fern: "#2F8F6B",
        mint: "#E2F1E9",
        notice: { bg: "#FFF1CC", edge: "#E8B93C", text: "#5E3D00" },
        alarm: { bg: "#FDECEA", edge: "#E57368", text: "#8C1D14" },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["Figtree", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
