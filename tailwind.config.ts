import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        grid: {
          bg:      "#04050a",
          panel:   "rgba(8,10,20,0.82)",
          cyan:    "#4df7ff",
          blue:    "#3b82f6",
          violet:  "#a78bfa",
          ember:   "#f97316",
          magenta: "#e879f9",
          text:    "#e2e8f0",
          muted:   "#64748b",
        },
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "'Fira Code'", "Consolas", "monospace"],
      },
      keyframes: {
        pulseLine: {
          "0%, 100%": { opacity: "0.6" },
          "50%":      { opacity: "1" },
        },
        terminalBlink: {
          "0%, 100%": { opacity: "1" },
          "50%":      { opacity: "0" },
        },
        statusPulse: {
          "0%, 100%": { transform: "scale(1)",   opacity: "1"   },
          "50%":      { transform: "scale(1.35)", opacity: "0.7" },
        },
        progressGlow: {
          "0%, 100%": { boxShadow: "0 0 8px #4df7ff55"  },
          "50%":      { boxShadow: "0 0 22px #4df7ffaa" },
        },
        ripple: {
          "0%":   { transform: "scale(0)", opacity: "0.4" },
          "100%": { transform: "scale(4)", opacity: "0"   },
        },
        glitchBefore: {
          "0%,100%": { clipPath: "inset(0 0 95% 0)", transform: "translate(-3px,0)"  },
          "20%":     { clipPath: "inset(20% 0 60% 0)", transform: "translate(3px,0)" },
          "40%":     { clipPath: "inset(60% 0 20% 0)", transform: "translate(-3px,0)"},
          "60%":     { clipPath: "inset(80% 0 5% 0)",  transform: "translate(3px,0)" },
          "80%":     { clipPath: "inset(40% 0 50% 0)", transform: "translate(-2px,0)"},
        },
        glitchAfter: {
          "0%,100%": { clipPath: "inset(90% 0 2% 0)",  transform: "translate(3px,0)"  },
          "20%":     { clipPath: "inset(50% 0 40% 0)",  transform: "translate(-3px,0)" },
          "40%":     { clipPath: "inset(10% 0 80% 0)",  transform: "translate(3px,0)"  },
          "60%":     { clipPath: "inset(30% 0 60% 0)",  transform: "translate(-3px,0)" },
          "80%":     { clipPath: "inset(70% 0 20% 0)",  transform: "translate(2px,0)"  },
        },
        scanLine: {
          "0%":   { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        bootFlicker: {
          "0%,100%": { opacity: "1"   },
          "10%":     { opacity: "0.4" },
          "20%":     { opacity: "1"   },
          "50%":     { opacity: "0.8" },
          "70%":     { opacity: "1"   },
          "90%":     { opacity: "0.6" },
        },
      },
      animation: {
        pulseLine:    "pulseLine 2.4s ease-in-out infinite",
        terminalBlink:"terminalBlink 1.1s step-end infinite",
        statusPulse:  "statusPulse 2s ease-in-out infinite",
        progressGlow: "progressGlow 2s ease-in-out infinite",
        ripple:       "ripple 0.6s linear",
        scanLine:     "scanLine 3.5s linear",
        bootFlicker:  "bootFlicker 0.4s linear",
      },
    },
  },
  plugins: [],
};

export default config;
