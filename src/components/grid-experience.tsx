"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";

import {
  credsToRupees,
  formatCompactNumber,
  formatIndianCurrency,
  type CreditTransaction,
  type GridCouponRecord,
  type GridDashboardData,
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
        ? {
            "Content-Type":
              "application/json",
          }
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
      p?.error ??
        `HTTP ${res.status}`,
    );

    (
      e as Error & {
        status?: number;
      }
    ).status = res.status;

    throw e;
  }

  return res.json() as Promise<T>;
}

function fmtDate(
  v?: string | null,
) {
  if (!v) return "—";

  return new Intl.DateTimeFormat(
    "en-IN",
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  ).format(new Date(v));
}

const ease = [
  0.22,
  1,
  0.36,
  1,
] as const;

const fadeUp = (
  delay = 0,
) => ({
  initial: {
    opacity: 0,
    y: 24,
  },
  animate: {
    opacity: 1,
    y: 0,
  },
  transition: {
    delay,
    duration: 0.8,
    ease,
  },
});

function StatusDot({
  status,
}: {
  status:
    | "ONLINE"
    | "DEGRADED"
    | "SYNCING";
}) {
  const cls =
    status === "ONLINE"
      ? "status-dot-online"
      : status ===
        "SYNCING"
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
      : status ===
        "EXPIRED"
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

function RankBadge({
  rank,
}: {
  rank: number;
}) {
  const isTop3 =
    rank >= 1 && rank <= 3;

  const badgeColor =
    rank === 1
      ? "bg-amber-500/20 border-amber-500/30 text-amber-300"
      : rank === 2
      ? "bg-slate-300/10 border-slate-300/20 text-slate-200"
      : rank === 3
      ? "bg-amber-600/10 border-amber-600/20 text-amber-200"
      : "bg-white/5 border-white/10 text-white/60";

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full border w-10 h-10 text-xs font-bold tracking-wider ${badgeColor}`}
    >
      #{rank}
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

  const [error, setError] =
    useState<string | null>(
      null,
    );

  const [credsInput, setCredsInput] =
    useState("1000");

  const [showTx, setShowTx] =
    useState(false);

  const [showAch, setShowAch] =
    useState(false);

  const [showActivity, setShowActivity] =
    useState(false);

  const [showOrders, setShowOrders] =
    useState(false);

  const [showBoot, setShowBoot] =
    useState(false);

  const [bootDone, setBootDone] =
    useState(false);

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
      typeof window !==
      "undefined"
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

      console.log(
        "[GRID_DASHBOARD]",
        d,
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
          (e as Error)
            .message ??
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

      const p =
        await gFetch<{
          dashboard: GridDashboardData;
        }>("/api/sync", {
          method: "POST",
        });

      setDashboard(
        p.dashboard,
      );
    } catch (e) {
      setError(
        (e as Error)
          .message ??
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

      const idempotencyKey =
        crypto.randomUUID();

      const p =
        await gFetch<{
          coupon: GridCouponRecord;
          dashboard: GridDashboardData;
        }>("/api/redeem", {
          method: "POST",
          headers: {
            "Idempotency-Key":
              idempotencyKey,
          },
          body: JSON.stringify({
            creds: Number(
              credsInput,
            ),
            idempotencyKey,
          }),
        });

      setDashboard(
        p.dashboard,
      );
    } catch (e) {
      setError(
        (e as Error)
          .message ??
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
    } catch (e) {
      setError(
        (e as Error)
          .message ??
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

  if (
    loading &&
    !dashboard
  ) {
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
        </div>
      </main>
    );
  }

  if (
    authRequired ||
    !dashboard
  ) {
    return (
      <main className="relative min-h-screen overflow-x-hidden">
        <HologramScene />

        <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-16">
          <div className="panel-shell max-w-2xl">
            <p className="panel-title">
              SECURE AUTH SYSTEM
            </p>

            <h1 className="mt-4 text-5xl uppercase tracking-[0.16em] text-white">
              THE GRID
            </h1>

            <div className="mt-8 flex flex-wrap gap-3">
              <button
                onClick={login}
                className="grid-button"
              >
                Enter System
              </button>
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

      <div className="relative z-10 mx-auto flex max-w-7xl flex-col gap-6">

        {/* HEADER */}

        <motion.header
          {...fadeUp(0)}
          className="panel-shell flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
        >
          <div>
            <p className="panel-title">
              THE GRID —
              LOYALTY OS
            </p>

            <h1 className="mt-2 text-3xl uppercase tracking-[0.18em] text-white md:text-5xl">
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

          <div className="flex flex-wrap items-center gap-3">
            <span className="data-chip">
              Sync:
              {" "}
              {
                d.system
                  .syncWindowLabel
              }
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

          {/* LEFT COLUMN */}

          <motion.div
            {...fadeUp(0.08)}
          >
            <TiltCard intensity={6}>
              <div className="panel-shell">

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

                  <div className="rounded-2xl border border-grid-cyan/20 bg-black/30 p-5">
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
                  <div className="rounded-3xl border border-white/10 bg-black/30 p-6">
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
                      Lifetime
                      {" "}
                      {formatCompactNumber(
                        d.wallet
                          .lifetimeCreds,
                      )}
                    </p>
                  </div>

                  <div className="grid gap-4">
                    <div className="rounded-3xl border border-white/10 bg-black/30 p-5">
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

                    <div className="rounded-3xl border border-white/10 bg-black/30 p-5">
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
              </div>
            </TiltCard>

            {/* GLOBAL ANALYTICS */}

            <motion.div
              {...fadeUp(0.16)}
              className="mt-6"
            >
              <TiltCard intensity={5}>
                <div className="panel-shell">
                  <p className="panel-title">
                    GLOBAL ANALYTICS
                  </p>

                  <h2 className="mt-3 text-xl uppercase tracking-[0.16em] text-white">
                    System Telemetry
                  </h2>

                  <div className="mt-6 grid gap-4 grid-cols-2 md:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-grid-cyan">
                        Active Users
                      </p>

                      <p className="mt-3 text-2xl font-semibold text-white">
                        <AnimatedCounter
                          value={
  d.globalStats?.activeUsers ?? 0
}
                        />
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-grid-cyan">
                        Total Issued
                      </p>

                      <p className="mt-3 text-2xl font-semibold text-white">
                        <AnimatedCounter
                          value={

  d.globalStats?.totalCredsIssued ?? 0

}
                        />
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-grid-violet">
                        Total Redeemed
                      </p>

                      <p className="mt-3 text-2xl font-semibold text-white">
                        <AnimatedCounter
                          value={
                            d.globalStats?.totalCredsRedeemed ?? 0
                          }
                        />
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-amber-400">
                        Total Savings
                      </p>

                      <p className="mt-3 text-xl font-semibold text-white">
                        {formatIndianCurrency(
                          d.globalStats?.totalSavingsRupees ?? 0
                        )}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-grid-cyan">
                        Coupons Issued
                      </p>

                      <p className="mt-3 text-2xl font-semibold text-white">
                        <AnimatedCounter
                          value={
                            d.globalStats?.totalCouponsIssued ?? 0
                          }
                        />
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-grid-violet">
                        Coupons Used
                      </p>

                      <p className="mt-3 text-2xl font-semibold text-white">
                        <AnimatedCounter
                          value={
  d.globalStats?.totalCouponsUsed ?? 0
}
                        />
                      </p>
                    </div>
                  </div>

                  {d.globalStats?.usersOnFraudHold && (
  <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
    <p className="text-[10px] uppercase tracking-[0.3em] text-red-400">
      Fraud Hold
    </p>

    <p className="mt-2 text-lg font-semibold text-red-300">
      <AnimatedCounter
        value={d.globalStats?.usersOnFraudHold ?? 0}
      />
      {" "}
      Users
    </p>
  </div>
)}
                </div>
              </TiltCard>
            </motion.div>

            {/* LIFETIME ANALYTICS */}

            <motion.div
              {...fadeUp(0.24)}
              className="mt-6"
            >
              <TiltCard intensity={4}>
                <div className="panel-shell">
                  <p className="panel-title">
                    LIFETIME STATS
                  </p>

                  <div className="mt-5 grid gap-4 grid-cols-2 md:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-grid-cyan">
                        Active Coupons
                      </p>

                      <p className="mt-3 text-2xl font-semibold text-white">
                        <AnimatedCounter
                          value={
                            d.lifetimeStats
                              .totalCouponsActive ??
                            0
                          }
                        />
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-amber-300">
                        Expired
                      </p>

                      <p className="mt-3 text-2xl font-semibold text-white">
                        <AnimatedCounter
                          value={
                            d.lifetimeStats
                              .totalCouponsExpired ??
                            0
                          }
                        />
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-grid-violet">
                        Used
                      </p>

                      <p className="mt-3 text-2xl font-semibold text-white">
                        <AnimatedCounter
                          value={
                            d.lifetimeStats
                              .totalCouponsUsed ?? 0
                          }
                        />
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-amber-400">
                        Total Savings
                      </p>

                      <p className="mt-3 text-xl font-semibold text-white">
                        {formatIndianCurrency(
                          d.lifetimeStats
                            .totalSavingsRupees ?? 0
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              </TiltCard>
            </motion.div>
          </motion.div>

          {/* RIGHT COLUMN */}

          <motion.div
            {...fadeUp(0.14)}
            className="grid gap-6"
          >

            {/* REDEEM */}

            <TiltCard intensity={4}>
              <div className="panel-shell">
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
                    value={
                      credsInput
                    }
                    onChange={(e) =>
                      setCredsInput(
                        e.target
                          .value,
                      )
                    }
                    placeholder="1000"
                  />

                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
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
                      disabled={
                        syncing
                      }
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

            {/* GLOBAL RANK */}

            <TiltCard intensity={4}>
              <div className="panel-shell">
                <p className="panel-title">
                  GLOBAL RANK
                </p>

                <h3 className="mt-2 text-lg uppercase tracking-[0.14em] text-white">
                  Elite Position
                </h3>

                <div className="mt-6 space-y-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.3em] text-grid-cyan">
                        Your Rank
                      </p>

                      <p className="mt-3 text-4xl font-bold text-white">
                        #{
                          d.globalRank
                            .rank ?? "—"
                        }
                      </p>
                    </div>

                    <RankBadge
                      rank={
                        d.globalRank
                          .rank ?? 0
                      }
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
                      <p className="text-[9px] uppercase tracking-[0.3em] text-grid-muted">
                        Movement
                      </p>

                      <p className="mt-2 text-lg font-semibold text-white">
                        {d.globalRank
                          .movement &&
                        d.globalRank
                          .movement > 0
                          ? `↑ ${d.globalRank.movement}`
                          : d.globalRank
                              .movement &&
                            d.globalRank
                              .movement < 0
                          ? `↓ ${Math.abs(
                              d
                                .globalRank
                                .movement,
                            )}`
                          : "→"}
                      </p>
                    </div>

                    
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
                    <p className="text-[9px] uppercase tracking-[0.3em] text-grid-muted">
                      Total Members
                    </p>

                    <p className="mt-2 text-xl font-semibold text-white">
                      <AnimatedCounter
                        value={
                          d.globalRank
                            .total ?? 0
                        }
                      />
                    </p>
                  </div>
                </div>
              </div>
            </TiltCard>

            {/* COUPONS */}

            <TiltCard intensity={3}>
              <div className="panel-shell">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="panel-title">
                      COUPON
                      VAULT
                    </p>

                    <h3 className="mt-2 text-lg uppercase tracking-[0.14em] text-white">
                      Redeemed
                    </h3>
                  </div>

                  <span className="data-chip">
                    {
                      d.coupons
                        .length
                    }
                    {" "}
                    TOTAL
                  </span>
                </div>

                <div className="mt-5 space-y-3">
                  {d.coupons
                    .length ===
                  0 ? (
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-grid-muted">
                      No coupons
                      generated yet.
                    </div>
                  ) : (
                    d.coupons
                      .slice(
                        0,
                        5,
                      )
                      .map(
                        (
                          coupon,
                        ) => (
                          <div
                            key={
                              coupon.id
                            }
                            className="rounded-2xl border border-white/10 bg-black/30 p-4 transition-all hover:border-grid-cyan/30 hover:bg-black/40"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium uppercase tracking-[0.08em] text-white">
                                  {
                                    coupon.code
                                  }
                                </p>

                                <p className="mt-1 text-xs text-grid-muted">
                                  {fmtDate(
                                    coupon.createdAt,
                                  )}
                                </p>
                              </div>

                              <div className="text-right">
                                <p className="text-xl font-semibold text-white">
                                  ₹
                                  {
                                    coupon.valueRupees
                                  }
                                </p>

                                <CouponBadge
                                  status={
                                    coupon.status
                                  }
                                />
                              </div>
                            </div>
                          </div>
                        ),
                      )
                  )}
                </div>
              </div>
            </TiltCard>

            {/* LEADERBOARD */}

            <TiltCard intensity={3}>
              <div className="panel-shell">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="panel-title">
                      GLOBAL
                      LEADERBOARD
                    </p>

                    <h3 className="mt-2 text-lg uppercase tracking-[0.14em] text-white">
                      Top Earners
                    </h3>
                  </div>

                  <span className="data-chip">
                    TOP 5
                  </span>
                </div>

                <div className="mt-5 space-y-3">
                  {d.leaderboard
                    .slice(
                      0,
                      5,
                    )
                    .map(
                      (
                        entry,
                        index,
                      ) => (
                        <div
                          key={
                            entry.memberId
                          }
                          className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/30 p-4 transition-all hover:border-grid-cyan/30"
                        >
                          <div className="flex items-center gap-3 flex-1">
                            <RankBadge
                              rank={index + 1}
                            />

                            <div>
                              <p className="text-sm uppercase tracking-[0.08em] text-white">
                                {
                                  entry.username
                                }
                              </p>

                              <p className="mt-1 text-xs text-grid-muted">
                                {
                                  entry.level
                                }
                              </p>
                            </div>
                          </div>

                          <div className="text-right">
                            <p className="text-xs text-grid-cyan">
                              {formatCompactNumber(
                                entry.lifetimeCreds,
                              )}
                            </p>

                            <p className="mt-1 text-xs text-grid-muted">
                              creds
                            </p>
                          </div>
                        </div>
                      ),
                    )}
                </div>
              </div>
            </TiltCard>

            {/* TRANSACTIONS */}

            <TiltCard intensity={3}>
              <div className="panel-shell">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="panel-title">
                      ACTIVITY LOG
                    </p>

                    <h3 className="mt-2 text-lg uppercase tracking-[0.14em] text-white">
                      Transactions
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setShowTx(
                        !showTx,
                      )
                    }
                    className="data-chip cursor-pointer hover:text-grid-cyan transition-colors"
                  >
                    {showTx
                      ? "COLLAPSE"
                      : "EXPAND"}
                  </button>
                </div>

                <AnimatePresence>
                  {(showTx ||
                    d
                      .recentTransactions
                      .length <=
                      4) && (
                    <motion.div
                      initial={{
                        opacity: 0,
                        height: 0,
                      }}
                      animate={{
                        opacity: 1,
                        height:
                          "auto",
                      }}
                      exit={{
                        opacity: 0,
                        height: 0,
                      }}
                      className="mt-5 space-y-3 overflow-hidden"
                    >
                      {d.recentTransactions
                        .slice(
                          0,
                          showTx
                            ? 12
                            : 4,
                        )
                        .map(
                          (
                            tx,
                          ) => (
                            <div
                              key={
                                tx.id
                              }
                              className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/30 p-4 transition-all hover:border-grid-cyan/30"
                            >
                              <div>
                                <TxBadge
                                  type={
                                    tx.type
                                  }
                                />

                                <p className="mt-2 text-sm text-white">
                                  {tx.description ??
                                    tx.source}
                                </p>

                                <p className="mt-1 text-xs text-grid-muted">
                                  {fmtDate(
                                    tx.createdAt,
                                  )}
                                </p>
                              </div>

                              <div className="text-right">
                                <p className="text-lg font-semibold text-white">
                                  {
                                    tx.amount
                                  }
                                </p>

                                <p className="text-xs text-grid-muted">
                                  Balance:
                                  {" "}
                                  {
                                    tx.balanceAfter
                                  }
                                </p>
                              </div>
                            </div>
                          ),
                        )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </TiltCard>

            {/* ACHIEVEMENTS */}

            {d.achievements &&
              d.achievements
                .length > 0 && (
                <TiltCard intensity={3}>
                  <div className="panel-shell">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="panel-title">
                          ACHIEVEMENT
                          MATRIX
                        </p>

                        <h3 className="mt-2 text-lg uppercase tracking-[0.14em] text-white">
                          Unlocked
                          Badges
                        </h3>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setShowAch(
                            !showAch,
                          )
                        }
                        className="data-chip cursor-pointer hover:text-grid-cyan transition-colors"
                      >
                        {showAch
                          ? "COLLAPSE"
                          : "EXPAND"}
                      </button>
                    </div>

                    <AnimatePresence>
                      {(showAch ||
                        d.achievements
                          .length <=
                          6) && (
                        <motion.div
                          initial={{
                            opacity: 0,
                            height: 0,
                          }}
                          animate={{
                            opacity: 1,
                            height:
                              "auto",
                          }}
                          exit={{
                            opacity: 0,
                            height: 0,
                          }}
                          className="mt-5 grid grid-cols-3 gap-3 overflow-hidden"
                        >
                          {d.achievements
                            .slice(
                              0,
                              showAch
                                ? undefined
                                : 6,
                            )
                            .map(
                              (
                                ach,
                              ) => (
                                <motion.div
                                  key={
                                    ach.key
                                  }
                                  initial={{
                                    opacity:
                                      0,
                                    scale:
                                      0.8,
                                  }}
                                  animate={{
                                    opacity:
                                      1,
                                    scale: 1,
                                  }}
                                  transition={{
                                    duration:
                                      0.4,
                                  }}
                                  className="rounded-2xl border border-white/10 bg-black/30 p-3 text-center hover:border-grid-cyan/30 transition-all"
                                >
                                  <div className="text-2xl">
                                    🏆
                                  </div>

                                  <p className="mt-2 text-xs uppercase tracking-[0.1em] text-white line-clamp-2">
                                    {
                                      ach.label
                                    }
                                  </p>

                                  {ach.unlockedAt && (
                                    <p className="mt-1 text-[10px] text-grid-cyan">
                                      {fmtDate(
                                        ach.unlockedAt,
                                      )}
                                    </p>
                                  )}
                                </motion.div>
                              ),
                            )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </TiltCard>
              )}

            {/* ACTIVITY FEED */}

            {d.activityFeed &&
              d.activityFeed
                .length > 0 && (
                <TiltCard intensity={3}>
                  <div className="panel-shell">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="panel-title">
                          LIVE ACTIVITY
                        </p>

                        <h3 className="mt-2 text-lg uppercase tracking-[0.14em] text-white">
                          System Feed
                        </h3>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setShowActivity(
                            !showActivity,
                          )
                        }
                        className="data-chip cursor-pointer hover:text-grid-cyan transition-colors"
                      >
                        {showActivity
                          ? "COLLAPSE"
                          : "EXPAND"}
                      </button>
                    </div>

                    <AnimatePresence>
                      {(showActivity ||
                        d.activityFeed
                          .length <=
                          5) && (
                        <motion.div
                          initial={{
                            opacity: 0,
                            height: 0,
                          }}
                          animate={{
                            opacity: 1,
                            height:
                              "auto",
                          }}
                          exit={{
                            opacity: 0,
                            height: 0,
                          }}
                          className="mt-5 space-y-3 overflow-hidden"
                        >
                          {d.activityFeed
                            .slice(
                              0,
                              showActivity
                                ? 15
                                : 5,
                            )
                            .map(
                              (
                                activity,
                                idx,
                              ) => (
                                <motion.div
                                  key={
                                    idx
                                  }
                                  initial={{
                                    opacity:
                                      0,
                                    x: -10,
                                  }}
                                  animate={{
                                    opacity:
                                      1,
                                    x: 0,
                                  }}
                                  transition={{
                                    duration:
                                      0.3,
                                    delay:
                                      idx *
                                      0.05,
                                  }}
                                  className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/30 p-3 text-sm"
                                >
                                  <span className="mt-0.5 inline-block w-2 h-2 bg-grid-cyan rounded-full flex-shrink-0" />

                                  <div className="flex-1 min-w-0">
                                    <p className="text-white line-clamp-2">
                                      {
                                        activity.description
                                      }
                                    </p>

                                    <p className="mt-1 text-xs text-grid-muted">
                                      {fmtDate(
                                        activity.createdAt,
                                      )}
                                    </p>
                                  </div>
                                </motion.div>
                              ),
                            )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </TiltCard>
              )}

            {/* ORDER HISTORY */}

            {d.orders &&
              d.orders.length >
                0 && (
                <TiltCard intensity={3}>
                  <div className="panel-shell">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="panel-title">
                          ORDER HISTORY
                        </p>

                        <h3 className="mt-2 text-lg uppercase tracking-[0.14em] text-white">
                          Transactions
                        </h3>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setShowOrders(
                            !showOrders,
                          )
                        }
                        className="data-chip cursor-pointer hover:text-grid-cyan transition-colors"
                      >
                        {showOrders
                          ? "COLLAPSE"
                          : "EXPAND"}
                      </button>
                    </div>

                    <AnimatePresence>
                      {(showOrders ||
                        d.orders
                          .length <=
                          4) && (
                        <motion.div
                          initial={{
                            opacity: 0,
                            height: 0,
                          }}
                          animate={{
                            opacity: 1,
                            height:
                              "auto",
                          }}
                          exit={{
                            opacity: 0,
                            height: 0,
                          }}
                          className="mt-5 space-y-3 overflow-hidden"
                        >
                          {d.orders
                            .slice(
                              0,
                              showOrders
                                ? 12
                                : 4,
                            )
                            .map(
                              (order) => (
                                <div
                                  key={
                                    order.id
                                  }
                                  className="rounded-2xl border border-white/10 bg-black/30 p-4 transition-all hover:border-grid-cyan/30"
                                >
                                  <div className="flex items-start justify-between">
                                    <div>
                                      <p className="text-sm font-medium uppercase tracking-[0.08em] text-white">
                                        Order{" "}
                                        {
                                          order.number
                                        }
                                      </p>

                                      <p className="mt-1 text-xs text-grid-muted">
                                        {fmtDate(
                                          order.purchasedDate,
                                        )}
                                      </p>

                                      {order.items && (
                                        <p className="mt-2 text-xs text-grid-cyan">
                                          {
                                            order.items
                                              .length
                                          }{" "}
                                          item
                                          {order
                                            .items
                                            .length !==
                                          1
                                            ? "s"
                                            : ""}
                                        </p>
                                      )}
                                    </div>

                                    <div className="text-right">
                                      <p className="text-lg font-semibold text-white">
                                        {formatIndianCurrency(
                                          order.total,
                                        )}
                                      </p>

                                      <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-grid-cyan">
                                        {
                                          order.status ??
                                            "COMPLETED"
                                        }
                                      </p>
                                    </div>
                                  </div>

                                  {order.couponCode && (
                                    <div className="mt-3 rounded-lg border border-grid-cyan/20 bg-grid-cyan/5 p-2">
                                      <p className="text-[10px] text-grid-cyan">
                                        ✓ Coupon
                                        Applied
                                      </p>
                                    </div>
                                  )}
                                </div>
                              ),
                            )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </TiltCard>
              )}

            {/* SYSTEM STATUS */}

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
                  Last sync:
                  {" "}
                  {fmtDate(
                    d.system
                      .syncedAt,
                  )}
                </p>
              </div>
            </TiltCard>
          </motion.div>
        </section>

        {error && (
          <motion.div
            {...fadeUp(0)}
            className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300"
          >
            {error}
          </motion.div>
        )}
      </div>
    </main>
  );
}