import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],

  darkMode: "class",

  theme: {
    extend: {

      /* ─────────────────────────────────────────────────────────────
         COLORS
      ───────────────────────────────────────────────────────────── */

      colors: {
        grid: {
          bg: "#02030a",
          secondary: "#050816",
          tertiary: "#0b1020",

          panel: "rgba(10,14,28,0.68)",
          surface: "rgba(15,18,40,0.52)",

          cyan: "#67e8f9",
          electric: "#4df7ff",
          blue: "#4f7cff",
          violet: "#9f7aea",
          purple: "#7c3aed",
          magenta: "#ff4fd8",
          gold: "#ffd89b",

          ember: "#f97316",

          text: "#f8fbff",
          muted: "#7f8ca8",
        },
      },

      /* ─────────────────────────────────────────────────────────────
         FONTS
      ───────────────────────────────────────────────────────────── */

      fontFamily: {
        sans: [
          "Inter",
          "SF Pro Display",
          "system-ui",
          "sans-serif",
        ],

        mono: [
          "'JetBrains Mono'",
          "'Fira Code'",
          "Consolas",
          "monospace",
        ],
      },

      /* ─────────────────────────────────────────────────────────────
         SHADOWS
      ───────────────────────────────────────────────────────────── */

      boxShadow: {
        "grid-sm":
          "0 0 20px rgba(77,247,255,0.08)",

        "grid-md":
          "0 0 40px rgba(77,247,255,0.12)",

        "grid-lg":
          "0 0 80px rgba(77,247,255,0.16)",

        "grid-xl":
          `
          0 20px 80px rgba(0,0,0,0.65),
          0 0 120px rgba(77,247,255,0.12),
          0 0 180px rgba(167,139,250,0.08)
          `,

        hologram:
          `
          0 0 30px rgba(77,247,255,0.18),
          0 0 60px rgba(77,247,255,0.08)
          `,
      },

      /* ─────────────────────────────────────────────────────────────
         BACKGROUNDS
      ───────────────────────────────────────────────────────────── */

      backgroundImage: {
        "grid-gradient":
          `
          linear-gradient(
            135deg,
            rgba(77,247,255,0.14),
            rgba(79,124,255,0.10),
            rgba(167,139,250,0.12)
          )
          `,

        "grid-radial":
          `
          radial-gradient(
            circle at center,
            rgba(77,247,255,0.16),
            transparent 70%
          )
          `,

        "grid-mesh":
          `
          linear-gradient(rgba(77,247,255,0.08) 1px, transparent 1px),
          linear-gradient(90deg, rgba(77,247,255,0.08) 1px, transparent 1px)
          `,
      },

      /* ─────────────────────────────────────────────────────────────
         BLUR
      ───────────────────────────────────────────────────────────── */

      backdropBlur: {
        xs: "2px",
        grid: "28px",
      },

      /* ─────────────────────────────────────────────────────────────
         KEYFRAMES
      ───────────────────────────────────────────────────────────── */

      keyframes: {

        pulseLine: {
          "0%, 100%": {
            opacity: "0.6",
          },

          "50%": {
            opacity: "1",
          },
        },

        terminalBlink: {
          "0%, 100%": {
            opacity: "1",
          },

          "50%": {
            opacity: "0",
          },
        },

        statusPulse: {
          "0%, 100%": {
            transform: "scale(1)",
            opacity: "1",
          },

          "50%": {
            transform: "scale(1.35)",
            opacity: "0.7",
          },
        },

        progressGlow: {
          "0%, 100%": {
            boxShadow:
              "0 0 8px #4df7ff55",
          },

          "50%": {
            boxShadow:
              "0 0 22px #4df7ffaa",
          },
        },

        ripple: {
          "0%": {
            transform: "scale(0)",
            opacity: "0.4",
          },

          "100%": {
            transform: "scale(4)",
            opacity: "0",
          },
        },

        galaxyFloat: {
          "0%": {
            transform:
              "translate3d(0,0,0) scale(1)",
          },

          "100%": {
            transform:
              "translate3d(2%,-3%,0) scale(1.12)",
          },
        },

        nebulaShift: {
          "0%": {
            transform:
              "translateX(-2%) translateY(0%)",
          },

          "100%": {
            transform:
              "translateX(2%) translateY(-2%)",
          },
        },

        starDrift: {
          from: {
            transform:
              "translateY(0px)",
          },

          to: {
            transform:
              "translateY(-400px)",
          },
        },

        floatingUI: {
          "0%, 100%": {
            transform:
              "translateY(0px)",
          },

          "50%": {
            transform:
              "translateY(-8px)",
          },
        },

        rotateAurora: {
          from: {
            transform:
              "rotate(0deg)",
          },

          to: {
            transform:
              "rotate(360deg)",
          },
        },

        hologramPulse: {
          "0%, 100%": {
            opacity: "0.5",
          },

          "50%": {
            opacity: "1",
          },
        },

        scanLine: {
          "0%": {
            transform:
              "translateY(-100%)",
          },

          "100%": {
            transform:
              "translateY(100vh)",
          },
        },

        bootFlicker: {
          "0%,100%": {
            opacity: "1",
          },

          "10%": {
            opacity: "0.4",
          },

          "20%": {
            opacity: "1",
          },

          "50%": {
            opacity: "0.8",
          },

          "70%": {
            opacity: "1",
          },

          "90%": {
            opacity: "0.6",
          },
        },
      },

      /* ─────────────────────────────────────────────────────────────
         ANIMATIONS
      ───────────────────────────────────────────────────────────── */

      animation: {

        pulseLine:
          "pulseLine 2.4s ease-in-out infinite",

        terminalBlink:
          "terminalBlink 1.1s step-end infinite",

        statusPulse:
          "statusPulse 2s ease-in-out infinite",

        progressGlow:
          "progressGlow 2s ease-in-out infinite",

        ripple:
          "ripple 0.6s linear",

        galaxyFloat:
          "galaxyFloat 24s ease-in-out infinite alternate",

        nebulaShift:
          "nebulaShift 30s ease-in-out infinite alternate",

        starDrift:
          "starDrift 120s linear infinite",

        floatingUI:
          "floatingUI 6s ease-in-out infinite",

        rotateAurora:
          "rotateAurora 20s linear infinite",

        hologramPulse:
          "hologramPulse 3s ease-in-out infinite",

        scanLine:
          "scanLine 3.5s linear",

        bootFlicker:
          "bootFlicker 0.4s linear",
      },
    },
  },

  plugins: [],
};

export default config;