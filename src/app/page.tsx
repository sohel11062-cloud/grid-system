import { GridExperience } from "@/components/grid-experience";

export default function HomePage() {

  return (

    <main
      className="
        relative
        min-h-screen
        overflow-x-hidden
      "
    >

      {/* GLOBAL CINEMATIC OVERLAY */}

      <div
        className="
          pointer-events-none
          fixed
          inset-0
          z-0
          overflow-hidden
        "
        aria-hidden
      >

        {/* NEBULA */}

        <div className="grid-nebula" />

        {/* GRID */}

        <div className="grid-mesh" />

        {/* RADIAL GLOW */}

        <div
          className="
            absolute
            left-[-20%]
            top-[-10%]
            h-[700px]
            w-[700px]
            rounded-full
            bg-cyan-400/10
            blur-[180px]
            animate-floatSlow
          "
        />

        <div
          className="
            absolute
            right-[-15%]
            top-[10%]
            h-[600px]
            w-[600px]
            rounded-full
            bg-violet-500/10
            blur-[180px]
            animate-floatReverse
          "
        />

        <div
          className="
            absolute
            bottom-[-20%]
            left-[20%]
            h-[700px]
            w-[700px]
            rounded-full
            bg-fuchsia-500/10
            blur-[220px]
            animate-floatSlow
          "
        />

        {/* VIGNETTE */}

        <div
          className="
            absolute
            inset-0
          "
          style={{
            background:
              `
              radial-gradient(
                circle at center,
                transparent 40%,
                rgba(0,0,0,0.55) 100%
              )
              `,
          }}
        />

      </div>

      {/* PAGE CONTENT */}

      <div
        className="
          relative
          z-10
        "
      >

        <GridExperience />

      </div>

    </main>
  );
}