"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion, useInView } from "framer-motion";

import {
  credsToRupees,
  formatCompactNumber,
  formatIndianCurrency,
  type CreditTransaction,
  type GridCouponRecord,
  type GridDashboardData,
  type LeaderboardPage,
} from "@/lib/grid";

import { AnimatedCounter } from "@/components/animated-counter";
import { BootSequence } from "@/components/boot-sequence";
import { TerminalText } from "@/components/terminal-text";
import { TiltCard } from "@/components/tilt-card";

const HologramScene = dynamic(
  () =>
    import("@/components/hologram-scene").then(
      (m) => m.HologramScene,
    ),
  {
    ssr: false,
    loading: () => (
      <div
        className="pointer-events-none fixed inset-0"
        aria-hidden
      />
    ),
  },
);

async function gFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body
        ? { "Content-Type": "application/json" }
        : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const p = (await res
      .json()
      .catch(() => null)) as {
      error?: string;
    } | null;

    const e = new Error(
      p?.error ?? `HTTP ${res.status}`,
    );

    (e as Error & { status?: number }).status =
      res.status;

    throw e;
  }

  return res.json() as Promise<T>;
}

function fmtDate(v?: string | null) {
  if (!v) return "—";

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(v));
}

function fmtShort(v?: string | null) {
  if (!v) return "—";

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "short",
  }).format(new Date(v));
}

const ease = [0.22, 1, 0.36, 1] as const;

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: {
    delay,
    duration: 0.8,
    ease,
  },
});

function StatusDot({
  status,
}: {
  status: "ONLINE" | "DEGRADED" | "SYNCING";
}) {
  const cls =
    status === "ONLINE"
      ? "status-dot-online"
      : status === "SYNCING"
      ? "status-dot-syncing"
      : "status-dot-degraded";

  return (
    <div className="flex items-center gap-2">
      <span className={cls} />

      <span className="text-[10px] uppercase tracking-[0.34em] text-grid-muted">
        {status}
      </span>
    </div>
  );
}

function CouponBadge({
  status,
}: {
  status: GridCouponRecord["status"];
}) {
  const cls =
    status === "ACTIVE"
      ? "text-grid-cyan"
      : status === "USED"
      ? "text-grid-violet"
      : status === "EXPIRED"
      ? "text-amber-300"
      : "text-red-400";

  return (
    <span
      className={`text-[10px] uppercase tracking-[0.3em] ${cls}`}
    >
      {status}
    </span>
  );
}

function TxBadge({
  type,
}: {
  type: CreditTransaction["type"];
}) {
  const icon =
    type === "EARN"
      ? "▲"
      : type === "BONUS"
      ? "★"
      : type === "REDEEM"
      ? "▼"
      : "~";

  return (
    <span className="text-[10px] uppercase tracking-[0.3em] text-grid-muted">
      {icon} {type}
    </span>
  );
}

export function GridExperience() {
  const [dashboard, setDashboard] =
    useState<GridDashboardData | null>(
      null,
    );

  const [loading, setLoading] =
    useState(true);

  const [authRequired, setAuth] =
    useState(false);

  const [syncing, setSyncing] =
    useState(false);

  const [redeeming, setRedeeming] =
    useState(false);

  const [error, setError] = useState<
    string | null
  >(null);

  const [credsInput, setCredsInput] =
    useState("1000");

  const [latestCoupon, setLatest] =
    useState<GridCouponRecord | null>(
      null,
    );

  const [showTx, setShowTx] =
    useState(false);

  const [showBoot, setShowBoot] =
    useState(false);

  const [bootDone, setBootDone] =
    useState(false);

  const ordersRef =
    useRef<HTMLDivElement>(null);

  const txRef =
    useRef<HTMLDivElement>(null);

  const cpnRef =
    useRef<HTMLDivElement>(null);

  const ordersIn = useInView(
    ordersRef,
    {
      once: true,
      margin: "-60px",
    },
  );

  const txIn = useInView(txRef, {
    once: true,
    margin: "-60px",
  });

  const cpnIn = useInView(cpnRef, {
    once: true,
    margin: "-60px",
  });

  useEffect(() => {
    if (
      !sessionStorage.getItem(
        "grid_booted",
      )
    ) {
      setShowBoot(true);
    } else {
      setBootDone(true);
    }
  }, []);

  const onBoot = useCallback(() => {
    sessionStorage.setItem(
      "grid_booted",
      "1",
    );

    setShowBoot(false);
    setBootDone(true);
  }, []);

  function login() {
    const ret =
      typeof window !== "undefined"
        ? encodeURIComponent(
            window.location.href,
          )
        : "/";

    window.location.assign(
      `/api/auth/login?returnTo=${ret}`,
    );
  }

  async function load() {
    try {
      setLoading(true);
      setError(null);

      const d =
        await gFetch<GridDashboardData>(
          "/api/dashboard",
        );

      setDashboard(d);
      setAuth(false);
    } catch (e) {
      if (
        (
          e as Error & {
            status?: number;
          }
        ).status === 401
      ) {
        setAuth(true);
        setDashboard(null);
      } else {
        setError(
          (e as Error).message ??
            "Could not load dashboard.",
        );
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSync() {
    try {
      setSyncing(true);
      setError(null);

      const p = await gFetch<{
        dashboard: GridDashboardData;
      }>("/api/sync", {
        method: "POST",
      });

      setDashboard(p.dashboard);
    } catch (e) {
      setError(
        (e as Error).message ??
          "Sync failed.",
      );
    } finally {
      setSyncing(false);
    }
  }

  async function handleRedeem(
    ev: React.FormEvent,
  ) {
    ev.preventDefault();

    try {
      setRedeeming(true);
      setError(null);
      setLatest(null);

      const idempotencyKey =
        crypto.randomUUID();

      const p = await gFetch<{
        coupon: GridCouponRecord;
        dashboard: GridDashboardData;
      }>("/api/redeem", {
        method: "POST",
        headers: {
          "Idempotency-Key":
            idempotencyKey,
        },
        body: JSON.stringify({
          creds: Number(credsInput),
          idempotencyKey,
        }),
      });

      setDashboard(p.dashboard);
      setLatest(p.coupon);
    } catch (e) {
      setError(
        (e as Error).message ??
          "Redemption failed.",
      );
    } finally {
      setRedeeming(false);
    }
  }

  async function handleLogout() {
    try {
      await gFetch(
        "/api/auth/logout",
        {
          method: "POST",
        },
      );

      setDashboard(null);
      setAuth(true);
      setLatest(null);
    } catch (e) {
      setError(
        (e as Error).message ??
          "Could not end session.",
      );
    }
  }

  if (showBoot)
    return (
      <BootSequence
        onComplete={onBoot}
      />
    );

  if (!bootDone) return null;

  if (loading && !dashboard) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-x-hidden">
        <HologramScene />

        <div className="panel-shell relative z-10 w-full max-w-md text-center">
          <p className="panel-title">
            INITIALIZING
          </p>

          <h1 className="mt-4 text-3xl uppercase tracking-[0.18em] text-white">
            THE GRID
          </h1>

          <div className="progress-track mx-auto mt-8 w-56">
            <div className="progress-fill w-full">
              <span className="progress-orb" />
            </div>
          </div>

          <p className="mt-4 text-xs text-grid-muted">
            Calibrating loyalty
            matrix...
          </p>
        </div>
      </main>
    );
  }

  if (authRequired || !dashboard) {
    return (
      <main className="relative min-h-screen overflow-x-hidden">
        <HologramScene />

        <div className="pointer-events-none fixed inset-0 z-[1] overflow-hidden">
          <div className="absolute left-[-10%] top-[10%] h-[500px] w-[500px] rounded-full bg-cyan-400/10 blur-[140px]" />

          <div className="absolute right-[-10%] top-[20%] h-[420px] w-[420px] rounded-full bg-violet-500/10 blur-[140px]" />

          <div className="absolute bottom-[-10%] left-[30%] h-[420px] w-[420px] rounded-full bg-fuchsia-500/10 blur-[160px]" />
        </div>

        <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-16">
          <div className="panel-shell max-w-2xl">
            <p className="panel-title">
              SECURE AUTH SYSTEM
            </p>

            <h1
              className="glitch-text mt-4 text-5xl uppercase tracking-[0.16em] text-white"
              data-text="THE GRID"
            >
              THE GRID
            </h1>

            <p className="mt-4 text-sm leading-7 text-grid-muted">
              This is not fashion.
              This is a system.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <button
                onClick={login}
                className="grid-button"
              >
                Enter System
              </button>

              <span className="data-chip">
                ENCRYPTED
              </span>

              <span className="data-chip">
                VERIFIED
              </span>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const d = dashboard;

  const redeemPreview =
    Number.isFinite(
      Number(credsInput),
    )
      ? credsToRupees(
          Number(credsInput),
        )
      : 0;

  return (
    <main className="relative min-h-screen overflow-x-hidden px-4 py-6 md:px-6 md:py-8">
      <HologramScene />

      {/* ATMOSPHERIC VFX */}

      <div className="pointer-events-none fixed inset-0 z-[1] overflow-hidden">
        <div className="absolute inset-0 opacity-[0.14]">
          <div className="absolute left-[-10%] top-[10%] h-[500px] w-[500px] rounded-full bg-cyan-400 blur-[140px] animate-pulse" />

          <div className="absolute right-[-10%] top-[20%] h-[420px] w-[420px] rounded-full bg-violet-500 blur-[140px] animate-pulse" />

          <div className="absolute bottom-[-10%] left-[30%] h-[420px] w-[420px] rounded-full bg-fuchsia-500 blur-[160px] animate-pulse" />
        </div>

        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(77,247,255,0.12) 1px, transparent 1px),
              linear-gradient(90deg, rgba(77,247,255,0.12) 1px, transparent 1px)
            `,
            backgroundSize:
              "80px 80px",
          }}
        />

        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            background:
              "repeating-linear-gradient(to bottom, transparent 0px, rgba(255,255,255,0.05) 1px, transparent 2px)",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto flex max-w-7xl flex-col gap-6">

        {/* HEADER */}

        <motion.header
          {...fadeUp(0)}
          className="panel-shell relative overflow-hidden flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
        >
          <div className="absolute inset-0 opacity-[0.08]">
            <div className="absolute inset-y-0 left-0 w-[40%] bg-gradient-to-r from-cyan-400/20 to-transparent blur-3xl" />
          </div>

          <div className="relative z-10">
            <p className="panel-title">
              THE GRID — LOYALTY OS
            </p>

            <h1
              className="glitch-text mt-2 text-3xl uppercase tracking-[0.18em] text-white md:text-5xl"
              data-text="THE GRID"
            >
              THE GRID
            </h1>

            <p className="mt-2 text-[11px] uppercase tracking-[0.34em] text-grid-cyan/80">
              <TerminalText
                text="THIS IS NOT FASHION. THIS IS A SYSTEM."
                speed={28}
                delay={200}
              />
            </p>
          </div>

          <div className="relative z-10 flex flex-wrap items-center gap-3">
            <span className="data-chip">
              Sync:{" "}
              {
                d.system
                  .syncWindowLabel
              }
            </span>

            <span className="data-chip hidden sm:inline-flex">
              Last:{" "}
              {fmtDate(
                d.system.syncedAt,
              )}
            </span>

            <button
              onClick={
                handleLogout
              }
              className="grid-button-ghost"
            >
              Exit Session
            </button>
          </div>
        </motion.header>

        {/* MAIN GRID */}

        <section className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">

          {/* LEFT */}

          <motion.div
            {...fadeUp(0.08)}
          >
            <TiltCard intensity={6}>
              <div className="panel-shell relative overflow-hidden">

                <div className="absolute inset-0 opacity-[0.05]">
                  <div className="absolute left-0 top-0 h-[200px] w-[200px] rounded-full bg-cyan-400 blur-[100px]" />
                </div>

                <div className="relative z-10">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="panel-title">
                        USER PANEL
                      </p>

                      <h2 className="mt-3 text-3xl uppercase tracking-[0.16em] text-white">
                        {
                          d.member
                            .username
                        }
                      </h2>

                      <p className="mt-2 text-sm text-grid-muted">
                        {
                          d.member
                            .email
                        }
                      </p>
                    </div>

                    <div className="rounded-2xl border border-grid-cyan/20 bg-black/30 p-5 backdrop-blur-xl">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-grid-cyan">
                        LEVEL
                      </p>

                      <p className="mt-2 text-lg uppercase tracking-[0.12em] text-white">
                        {
                          d.wallet
                            .level
                            .label
                        }
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    <div className="rounded-3xl border border-white/10 bg-black/30 p-6 backdrop-blur-xl">
                      <p className="panel-title">
                        AVAILABLE
                        CREDS
                      </p>

                      <div className="mt-4 text-6xl font-bold text-white">
                        <AnimatedCounter
                          value={
                            d.wallet
                              .availableCreds
                          }
                        />
                      </div>

                      <p className="mt-3 text-xs text-grid-muted">
                        Lifetime{" "}
                        {formatCompactNumber(
                          d.wallet
                            .lifetimeCreds,
                        )}
                      </p>
                    </div>

                    <div className="grid gap-4">
                      <div className="rounded-3xl border border-white/10 bg-black/30 p-5 backdrop-blur-xl">
                        <p className="panel-title">
                          PURCHASE
                          VALUE
                        </p>

                        <p className="mt-4 text-2xl font-semibold text-white">
                          {formatIndianCurrency(
                            d.wallet
                              .totalPurchaseValue,
                          )}
                        </p>
                      </div>

                      <div className="rounded-3xl border border-white/10 bg-black/30 p-5 backdrop-blur-xl">
                        <p className="panel-title">
                          BONUS
                          CREDS
                        </p>

                        <p className="mt-4 text-2xl font-semibold text-white">
                          {
                            d.wallet
                              .bonusCreds
                          }
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 rounded-3xl border border-white/10 bg-black/30 p-5 backdrop-blur-xl">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="panel-title">
                          LEVEL
                          PROGRESSION
                        </p>

                        <p className="mt-2 text-xs text-grid-muted">
                          {Math.round(
                            d.wallet
                              .progressRatio *
                              100,
                          )}
                          %
                          Complete
                        </p>
                      </div>

                      <span className="data-chip">
                        ACTIVE
                      </span>
                    </div>

                    <div className="progress-track mt-5">
                      <motion.div
                        className="progress-fill"
                        initial={{
                          width: 0,
                        }}
                        animate={{
                          width: `${Math.max(
                            d.wallet
                              .progressRatio *
                              100,
                            2,
                          )}%`,
                        }}
                        transition={{
                          duration: 1.4,
                        }}
                      >
                        <span className="progress-orb" />
                      </motion.div>
                    </div>
                  </div>
                </div>
              </div>
            </TiltCard>
          </motion.div>

          {/* RIGHT */}

          <motion.div
            {...fadeUp(0.14)}
            className="grid gap-6"
          >
            <TiltCard intensity={4}>
              <div className="panel-shell relative overflow-hidden">
                <p className="panel-title">
                  REDEEM PANEL
                </p>

                <h2 className="mt-2 text-xl uppercase tracking-[0.16em] text-white">
                  Convert Creds
                </h2>

                <form
                  className="mt-6 space-y-4"
                  onSubmit={
                    handleRedeem
                  }
                >
                  <input
                    className="grid-input"
                    inputMode="numeric"
                    value={credsInput}
                    onChange={(e) =>
                      setCredsInput(
                        e.target.value,
                      )
                    }
                    placeholder="1000"
                  />

                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur-xl">
                    <p className="panel-title">
                      OUTPUT
                    </p>

                    <p className="mt-3 text-3xl font-bold text-white">
                      {formatIndianCurrency(
                        redeemPreview,
                      )}
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      disabled={
                        redeeming
                      }
                      className="grid-button flex-1"
                    >
                      {redeeming
                        ? "Generating..."
                        : "Generate Coupon"}
                    </button>

                    <button
                      type="button"
                      disabled={syncing}
                      onClick={
                        handleSync
                      }
                      className="grid-button-ghost"
                    >
                      {syncing
                        ? "Syncing..."
                        : "Grid Sync"}
                    </button>
                  </div>
                </form>
              </div>
            </TiltCard>

            <TiltCard intensity={3}>
              <div className="panel-shell">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="panel-title">
                      SYSTEM
                      STATUS
                    </p>

                    <h3 className="mt-2 text-lg uppercase tracking-[0.14em] text-white">
                      Ledger
                      Online
                    </h3>
                  </div>

                  <StatusDot
                    status={
                      syncing
                        ? "SYNCING"
                        : d.system
                            .connection
                    }
                  />
                </div>

                <p className="mt-4 text-sm text-grid-muted">
                  Last sync:{" "}
                  {fmtDate(
                    d.system.syncedAt,
                  )}
                </p>
              </div>
            </TiltCard>
          </motion.div>
        </section>
      </div>
    </main>
  );
}