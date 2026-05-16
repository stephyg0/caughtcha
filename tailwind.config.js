/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: ["'IBM Plex Mono'", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      colors: {
        signal: {
          green: "#8dff9a",
          red: "#ff3d3d",
          amber: "#ffd166",
          black: "#050606"
        }
      },
      boxShadow: {
        surveillance: "0 0 0 1px rgba(141,255,154,.16), 0 18px 80px rgba(0,0,0,.55)",
        redline: "0 0 0 1px rgba(255,61,61,.2), 0 18px 90px rgba(255,61,61,.12)"
      },
      keyframes: {
        scan: {
          "0%": { transform: "translateY(-120%)" },
          "100%": { transform: "translateY(120%)" }
        },
        flicker: {
          "0%, 100%": { opacity: ".98" },
          "18%": { opacity: ".86" },
          "21%": { opacity: "1" },
          "59%": { opacity: ".9" },
          "62%": { opacity: ".98" }
        },
        flash: {
          "0%": { opacity: "0" },
          "12%": { opacity: ".95" },
          "100%": { opacity: "0" }
        }
      },
      animation: {
        scan: "scan 2.8s linear infinite",
        flicker: "flicker 4s linear infinite",
        flash: "flash .45s ease-out"
      }
    }
  },
  plugins: []
};
