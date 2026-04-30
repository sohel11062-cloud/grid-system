import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        grid: {
          bg: "#04060d",
          panel: "rgba(9, 14, 30, 0.72)",
          cyan: "#4df7ff",
          blue: "#2c8bff",
          violet: "#8b5cf6",
          ember: "#ff7a18",
          magenta: "#ff4fd8",
          text: "#e6fbff",
          muted: "#91a9c8"
        }
      },
      boxShadow: {
        neon: "0 0 0 1px rgba(77,247,255,0.18), 0 0 36px rgba(44,139,255,0.18), 0 0 72px rgba(255,79,216,0.12)",
        ember: "0 0 30px rgba(255,122,24,0.18)"
      },
      backgroundImage: {
        "grid-radial":
          "radial-gradient(circle at top, rgba(44,139,255,0.2), transparent 30%), radial-gradient(circle at 80% 20%, rgba(255,79,216,0.16), transparent 25%), linear-gradient(180deg, rgba(4,6,13,0.84) 0%, rgba(4,6,13,0.98) 100%)"
      },
      keyframes: {
        pulseLine: {
          "0%, 100%": { opacity: "0.45", transform: "scaleX(0.96)" },
          "50%": { opacity: "1", transform: "scaleX(1)" }
        },
        floatSlow: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" }
        },
        chromaDrift: {
          "0%, 100%": { transform: "translate3d(0, 0, 0)", opacity: "0.55" },
          "50%": { transform: "translate3d(0, -6px, 0)", opacity: "0.95" }
        }
      },
      animation: {
        pulseLine: "pulseLine 2.6s ease-in-out infinite",
        floatSlow: "floatSlow 6s ease-in-out infinite",
        chromaDrift: "chromaDrift 6s ease-in-out infinite"
      }
    }
  },
  plugins: []
};

export default config;
