import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        grid: {
          bg:      "#04060d",
          panel:   "rgba(9,14,30,0.72)",
          cyan:    "#4df7ff",
          blue:    "#2c8bff",
          violet:  "#8b5cf6",
          ember:   "#ff7a18",
          magenta: "#ff4fd8",
          text:    "#e6fbff",
          muted:   "#91a9c8",
        },
      },
      boxShadow: {
        neon:       "0 0 0 1px rgba(77,247,255,0.18),0 0 36px rgba(44,139,255,0.18),0 0 72px rgba(255,79,216,0.1)",
        "neon-hover":"0 0 0 1px rgba(77,247,255,0.4),0 8px 60px rgba(44,139,255,0.3),0 0 100px rgba(255,79,216,0.18)",
        "neon-cyan": "0 0 0 1px rgba(77,247,255,0.5),0 0 30px rgba(77,247,255,0.35)",
        "neon-magenta":"0 0 0 1px rgba(255,79,216,0.4),0 0 24px rgba(255,79,216,0.25)",
        ember:       "0 0 30px rgba(255,122,24,0.18)",
        glow:        "0 0 80px rgba(77,247,255,0.12),0 0 40px rgba(44,139,255,0.1)",
      },
      backgroundImage: {
        "grid-radial":
          "radial-gradient(circle at top,rgba(44,139,255,0.2),transparent 30%),radial-gradient(circle at 80% 20%,rgba(255,79,216,0.16),transparent 25%),linear-gradient(180deg,rgba(4,6,13,0.84) 0%,rgba(4,6,13,0.98) 100%)",
        "cyber-gradient":
          "linear-gradient(135deg,rgba(77,247,255,0.15),rgba(139,92,246,0.1),rgba(255,79,216,0.12))",
      },
      keyframes: {
        // Existing
        pulseLine:    { "0%,100%":{ opacity:"0.45",transform:"scaleX(0.96)" },"50%":{ opacity:"1",transform:"scaleX(1)" } },
        floatSlow:    { "0%,100%":{ transform:"translateY(0px)" },"50%":{ transform:"translateY(-8px)" } },
        chromaDrift:  { "0%,100%":{ transform:"translate3d(0,0,0)",opacity:"0.55" },"50%":{ transform:"translate3d(0,-6px,0)",opacity:"0.95" } },
        // Phase 3
        terminalBlink:{ "0%,100%":{ opacity:"1" },"50%":{ opacity:"0" } },
        statusPulse:  {
          "0%,100%":{ boxShadow:"0 0 0 0 rgba(77,247,255,0.8)",transform:"scale(1)" },
          "70%":     { boxShadow:"0 0 0 10px rgba(77,247,255,0)",transform:"scale(1.18)" },
        },
        progressGlow: { "0%,100%":{ opacity:"0.7",boxShadow:"0 0 14px 5px rgba(77,247,255,0.8)" },"50%":{ opacity:"1",boxShadow:"0 0 24px 10px rgba(77,247,255,1)" } },
        ripple:       { "0%":{ transform:"scale(0)",opacity:"0.6" },"100%":{ transform:"scale(4.5)",opacity:"0" } },
        glitchBefore: {
          "0%,89%,100%":{ clipPath:"inset(0 0 100% 0)",transform:"none" },
          "90%":  { clipPath:"inset(8% 0 55% 0)",  transform:"translate(-3px,0)" },
          "91%":  { clipPath:"inset(35% 0 30% 0)", transform:"translate(2px,0)" },
          "92%":  { clipPath:"inset(65% 0 10% 0)", transform:"translate(-2px,0)" },
          "93%":  { clipPath:"inset(0 0 100% 0)",  transform:"none" },
        },
        glitchAfter:  {
          "0%,91%,100%":{ clipPath:"inset(0 0 100% 0)",transform:"none" },
          "92%": { clipPath:"inset(25% 0 45% 0)", transform:"translate(3px,0)" },
          "93%": { clipPath:"inset(55% 0 20% 0)", transform:"translate(-2px,0)" },
          "94%": { clipPath:"inset(0 0 100% 0)",  transform:"none" },
        },
        scanLine:     { "0%":{ top:"-10%" },"100%":{ top:"110%" } },
        borderGlow:   { "0%,100%":{ opacity:"0.5" },"50%":{ opacity:"1" } },
        fadeInUp:     { "0%":{ opacity:"0",transform:"translateY(20px)" },"100%":{ opacity:"1",transform:"translateY(0)" } },
        bootFlicker:  {
          "0%,100%":{ opacity:"1" },
          "8%":  { opacity:"0.9" },
          "9%":  { opacity:"1" },
          "42%": { opacity:"1" },
          "43%": { opacity:"0.85" },
          "44%": { opacity:"1" },
        },
      },
      animation: {
        pulseLine:      "pulseLine 2.6s ease-in-out infinite",
        floatSlow:      "floatSlow 6s ease-in-out infinite",
        chromaDrift:    "chromaDrift 6s ease-in-out infinite",
        "terminal-blink":"terminalBlink 1.1s step-end infinite",
        "status-pulse": "statusPulse 2.2s ease-out infinite",
        "progress-glow":"progressGlow 1.8s ease-in-out infinite",
        ripple:         "ripple 0.6s linear forwards",
        "glitch-before":"glitchBefore 9s ease-in-out infinite",
        "glitch-after": "glitchAfter 9s ease-in-out infinite",
        "scan-line":    "scanLine 4s linear infinite",
        "border-glow":  "borderGlow 3s ease-in-out infinite",
        "fade-in-up":   "fadeInUp 0.65s ease-out forwards",
        "boot-flicker": "bootFlicker 6s ease-in-out infinite",
      },
      transitionTimingFunction: {
        "spring": "cubic-bezier(0.34,1.56,0.64,1)",
        "smooth": "cubic-bezier(0.22,1,0.36,1)",
      },
    },
  },
  plugins: [],
};

export default config;
