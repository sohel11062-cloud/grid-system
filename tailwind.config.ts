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
        neon:         "0 0 0 1px rgba(77,247,255,0.18),0 0 36px rgba(44,139,255,0.16),0 0 70px rgba(255,79,216,0.09)",
        "neon-hover": "0 0 0 1px rgba(77,247,255,0.38),0 10px 60px rgba(44,139,255,0.26),0 0 90px rgba(255,79,216,0.15)",
        "neon-cyan":  "0 0 0 1px rgba(77,247,255,0.5),0 0 28px rgba(77,247,255,0.3)",
        glow:         "0 0 70px rgba(77,247,255,0.1),0 0 35px rgba(44,139,255,0.08)",
      },
      backgroundImage: {
        "grid-radial":
          "radial-gradient(ellipse at top,rgba(44,139,255,0.18),transparent 30%),radial-gradient(ellipse at 82% 20%,rgba(255,79,216,0.14),transparent 26%),linear-gradient(180deg,rgba(4,6,13,0.85) 0%,rgba(4,6,13,0.99) 100%)",
      },
      keyframes: {
        pulseLine:      { "0%,100%":{ opacity:"0.42",transform:"scaleX(0.96)" },"50%":{ opacity:"1",transform:"scaleX(1)" } },
        floatSlow:      { "0%,100%":{ transform:"translateY(0)" },"50%":{ transform:"translateY(-8px)" } },
        terminalBlink:  { "0%,100%":{ opacity:"1" },"50%":{ opacity:"0" } },
        statusPulse:    { "0%,100%":{ boxShadow:"0 0 0 0 rgba(77,247,255,0.8)",transform:"scale(1)" },"70%":{ boxShadow:"0 0 0 10px rgba(77,247,255,0)",transform:"scale(1.18)" } },
        progressGlow:   { "0%,100%":{ opacity:"0.75",boxShadow:"0 0 12px 4px rgba(77,247,255,0.8)" },"50%":{ opacity:"1",boxShadow:"0 0 22px 8px rgba(77,247,255,1)" } },
        ripple:         { "0%":{ transform:"scale(0)",opacity:"0.6" },"100%":{ transform:"scale(4.5)",opacity:"0" } },
        glitchBefore:   { "0%,87%,100%":{ clipPath:"inset(0 0 100% 0)",transform:"none" },"88%":{ clipPath:"inset(6% 0 58% 0)",transform:"translate(-3px,0)" },"89%":{ clipPath:"inset(32% 0 28% 0)",transform:"translate(2px,0)" },"90%":{ clipPath:"inset(60% 0 8% 0)",transform:"translate(-2px,0)" },"91%":{ clipPath:"inset(0 0 100% 0)",transform:"none" } },
        glitchAfter:    { "0%,89%,100%":{ clipPath:"inset(0 0 100% 0)",transform:"none" },"90%":{ clipPath:"inset(20% 0 48% 0)",transform:"translate(3px,0)" },"91%":{ clipPath:"inset(52% 0 18% 0)",transform:"translate(-2px,0)" },"92%":{ clipPath:"inset(0 0 100% 0)",transform:"none" } },
        scanLine:       { "0%":{ top:"-5%" },"100%":{ top:"108%" } },
        fadeInUp:       { "0%":{ opacity:"0",transform:"translateY(20px)" },"100%":{ opacity:"1",transform:"translateY(0)" } },
        bootFlicker:    { "0%,100%":{ opacity:"1" },"8%":{ opacity:"0.88" },"9%":{ opacity:"1" },"44%":{ opacity:"1" },"45%":{ opacity:"0.84" },"46%":{ opacity:"1" } },
        noiseDrift:     { "0%":{ transform:"translate3d(0,0,0)" },"50%":{ transform:"translate3d(-1.5%,1%,0)" },"100%":{ transform:"translate3d(1%,-1%,0)" } },
      },
      animation: {
        pulseLine:         "pulseLine 2.6s ease-in-out infinite",
        floatSlow:         "floatSlow 6s ease-in-out infinite",
        "terminal-blink":  "terminalBlink 1.1s step-end infinite",
        "status-pulse":    "statusPulse 2.2s ease-out infinite",
        "progress-glow":   "progressGlow 1.8s ease-in-out infinite",
        ripple:            "ripple 0.55s ease-out forwards",
        "glitch-before":   "glitchBefore 10s ease-in-out infinite",
        "glitch-after":    "glitchAfter 10s ease-in-out infinite",
        "scan-line":       "scanLine 3s linear infinite",
        "fade-in-up":      "fadeInUp 0.65s ease-out forwards",
        "boot-flicker":    "bootFlicker 6s ease-in-out infinite",
        "noise-drift":     "noiseDrift 14s linear infinite",
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.34,1.56,0.64,1)",
        smooth: "cubic-bezier(0.22,1,0.36,1)",
      },
    },
  },
  plugins: [],
};

export default config;