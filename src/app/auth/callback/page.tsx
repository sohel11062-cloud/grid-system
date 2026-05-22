"use client";

import {
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  useSearchParams,
} from "next/navigation";

function CallbackInner() {

  const params =
    useSearchParams();

  const ran =
    useRef(false);

  const [msg, setMsg] =
    useState("Authenticating…");

  const [isError, setIsError] =
    useState(false);

  useEffect(() => {

    if (ran.current) {
      return;
    }

    ran.current = true;

    const code =
      params.get("code");

    const state =
      params.get("state");

    const error =
      params.get("error");

    // OAuth cancelled / malformed
    if (error || !code || !state) {

      setIsError(true);

      setMsg(
        error
          ? "Authentication cancelled."
          : "Missing parameters. Please try again."
      );

      setTimeout(() => {
        window.location.href = "/";
      }, 2500);

      return;
    }

    async function completeAuth() {

      try {

        const response =
          await fetch(
            "/api/auth/exchange",
            {
              method: "POST",

              credentials: "include",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body: JSON.stringify({
                code,
                state,
              }),
            }
          );

        const data =
          await response.json();

        if (!response.ok || !data.success) {

          throw new Error(
            data.error ||
            "Authentication failed."
          );
        }

        setMsg(
          "Access granted. Entering the Grid…"
        );

        // IMPORTANT:
        // Use full browser navigation
        // so session cookies fully commit.
        window.location.href =
          data.returnTo || "/";

      } catch (error) {

        console.error(
          "[GRID_AUTH] callback failed:",
          error
        );

        setIsError(true);

        setMsg(
          error instanceof Error
            ? error.message
            : "Authentication error. Please try again."
        );

        setTimeout(() => {
          window.location.href = "/";
        }, 2500);
      }
    }

    completeAuth();

  }, [params]);

  return (
    <main
      className="
        flex
        min-h-screen
        items-center
        justify-center
        bg-grid-bg
        px-6
      "
    >

      <div className="w-full max-w-sm text-center">

        <p
          className="
            text-[10px]
            uppercase
            tracking-[0.42em]
            text-grid-cyan/70
          "
        >
          THE GRID
        </p>

        <h1
          className="
            mt-4
            text-xl
            uppercase
            tracking-[0.2em]
            text-white
          "
        >
          Auth Gateway
        </h1>

        <div
          className="
            progress-track
            mx-auto
            mt-8
            w-48
          "
        >
          <div
            className="
              progress-fill
              animate-pulseLine
              w-full
            "
          >
            <span className="progress-orb" />
          </div>
        </div>

        <p
          className={`
            mt-6
            text-sm
            ${
              isError
                ? "text-red-400"
                : "text-grid-muted"
            }
          `}
        >
          {msg}
        </p>

      </div>
    </main>
  );
}

export default function AuthCallbackPage() {

  return (
    <Suspense
      fallback={
        <main
          className="
            flex
            min-h-screen
            items-center
            justify-center
            bg-grid-bg
          "
        >
          <p className="text-sm text-grid-muted">
            Loading…
          </p>
        </main>
      }
    >
      <CallbackInner />
    </Suspense>
  );
}