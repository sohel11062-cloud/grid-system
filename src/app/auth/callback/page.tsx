"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Decrypting member credentials...");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function completeLogin() {
      const currentUrl = new URL(window.location.href);
      const hashParams = new URLSearchParams(currentUrl.hash.replace(/^#/, ""));
      const params = hashParams.get("code") ? hashParams : currentUrl.searchParams;
      const authError = params.get("error");
      const code = params.get("code");
      const state = params.get("state");

      if (authError) {
        if (!cancelled) {
          setError(`Wix returned "${authError}".`);
        }
        return;
      }

      if (!code || !state) {
        if (!cancelled) {
          setError("Missing login code. Restart the sign-in flow.");
        }
        return;
      }

      try {
        setMessage("Binding session to THE GRID...");

        const response = await fetch(`${API_BASE_URL}/api/auth/exchange`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ code, state })
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error || "Login exchange failed.");
        }

        const payload = (await response.json()) as {
          ok: boolean;
          returnTo?: string;
        };

        if (!cancelled) {
          setMessage("Session accepted. Entering the system...");
          router.replace(payload.returnTo || "/");
        }
      } catch (reason) {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "Could not complete sign-in.");
        }
      }
    }

    completeLogin();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="relative flex min-h-screen items-center justify-center px-6 py-16">
      <div className="panel-shell z-10 max-w-xl">
        <p className="panel-title">AUTH CALLBACK</p>
        <h1 className="mt-4 text-3xl uppercase tracking-[0.2em] text-grid-text">THE GRID</h1>
        <p className="mt-4 text-sm text-grid-muted">{error ?? message}</p>

        {error ? (
          <a href="/" className="grid-button mt-8">
            Return To Login
          </a>
        ) : (
          <div className="mt-8 h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-full origin-left animate-pulseLine bg-gradient-to-r from-grid-cyan via-grid-blue to-grid-magenta" />
          </div>
        )}
      </div>
    </main>
  );
}
