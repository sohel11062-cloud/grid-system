"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Decrypting member credentials...");
  const [progress, setProgress] = useState(20);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      // Parse code + state from URL (supports both hash and query params)
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      const params = hash.get("code") ? hash : url.searchParams;

      const authError = params.get("error");
      const code      = params.get("code");
      const state     = params.get("state");

      if (authError) {
        if (!cancelled) setError(`Wix returned an error: "${authError}". Please try again.`);
        return;
      }

      if (!code || !state) {
        if (!cancelled) setError("Missing login parameters. Please restart the sign-in flow.");
        return;
      }

      try {
        if (!cancelled) { setMessage("Binding session to THE GRID..."); setProgress(55); }

        const res = await fetch(`${API_BASE_URL}/api/auth/exchange`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, state }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: "Exchange failed." })) as { error?: string };
          throw new Error(body.error ?? "Login exchange failed.");
        }

        const body = await res.json() as { ok: boolean; returnTo?: string };

        if (!cancelled) {
          setMessage("Session accepted. Entering the system...");
          setProgress(100);
          setTimeout(() => router.replace(body.returnTo || "/"), 500);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not complete sign-in.");
        }
      }
    }

    run();
    return () => { cancelled = true; };
  }, [router]);

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-grid-bg px-6 py-16">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(77,247,255,0.08),transparent_40%)]" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="panel-shell z-10 w-full max-w-md"
      >
        <p className="panel-title">AUTH CALLBACK</p>
        <h1 className="mt-4 text-3xl uppercase tracking-[0.2em] text-white">THE GRID</h1>

        <p className={`mt-4 text-sm ${error ? "text-red-400" : "text-grid-muted"}`}>
          {error ?? message}
        </p>

        {!error && (
          <div className="progress-track mt-8">
            <motion.div
              className="progress-fill"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              {progress > 10 && <span className="progress-orb" />}
            </motion.div>
          </div>
        )}

        {error && (
          <motion.a
            href="/"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="grid-button mt-8 inline-flex"
          >
            Return To Login
          </motion.a>
        )}
      </motion.div>
    </main>
  );
}