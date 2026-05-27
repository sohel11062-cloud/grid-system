import type {
  Metadata,
  Viewport,
} from "next";

import "./globals.css";

export const metadata: Metadata = {
  title:
    "THE GRID — Loyalty OS",

  description:
    "The Vibe Canvas Reward Engine",

  robots:
    "noindex, nofollow",

  applicationName:
    "THE GRID",

  keywords: [
    "The Vibe Canvas",
    "THE GRID",
    "Cyberpunk Loyalty",
    "Rewards Engine",
    "Tech Fashion",
    "Gen-Z Fashion",
  ],

  openGraph: {
    title:
      "THE GRID — Loyalty OS",

    description:
      "Cybernetic rewards ecosystem for The Vibe Canvas.",

    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",

  initialScale: 1,

  maximumScale: 1,

  userScalable: false,

  themeColor: "#04050a",

  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className="scroll-smooth dark"
    >
      <head>
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />

        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />

        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />

        <meta
          name="format-detection"
          content="telephone=no, date=no, email=no, address=no"
        />
      </head>

      <body
        className="
          min-h-screen
          overflow-x-hidden
          bg-grid-bg
          text-grid-text
          antialiased
          selection:bg-cyan-400/30
          selection:text-white
        "
      >
        {/* BACKGROUND FX */}

        <div className="grid-nebula" />

        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">

          <div className="absolute inset-0 bg-[#04050a]" />

          <div className="absolute left-[-10%] top-[10%] h-[500px] w-[500px] rounded-full bg-cyan-400/10 blur-[140px]" />

          <div className="absolute right-[-10%] top-[20%] h-[420px] w-[420px] rounded-full bg-violet-500/10 blur-[140px]" />

          <div className="absolute bottom-[-10%] left-[30%] h-[420px] w-[420px] rounded-full bg-fuchsia-500/10 blur-[160px]" />

        </div>

        {/* APP */}

        <div className="relative z-10 flex min-h-screen flex-col">
          {children}
        </div>

      </body>
    </html>
  );
}