"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";

import {
  credsToRupees,
  formatCompactNumber,
  formatIndianCurrency,
  type GridCouponRecord,
  type GridDashboardData
} from "@/lib/grid";
import { AnimatedCounter } from "@/components/animated-counter";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const HologramScene = dynamic(
  () => import("@/components/hologram-scene").then((module) => module.HologramScene),
  {
    ssr: false,
    loading: () => <div className="pointer-events-none fixed inset-0 bg-grid-radial" aria-hidden="true" />
  }
);

async function gridFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers
    }
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    const message = payload?.error || `Request failed with ${response.status}`;
    const error = new Error(message);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  return response.json() as Promise<T>;
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Awaiting signal";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatCouponLabel(coupon: GridCouponRecord) {
  return `${coupon.code} · ${formatIndianCurrency(coupon.valueRupees)}`;
}

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="relative z-10 flex min-h-screen items-center px-6 py-16">
      <div className="mx-auto grid w-full max-w-6xl gap-8 xl:grid-cols-[1.2fr_0.8fr]">
        <motion.section
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="panel-shell flex flex-col justify-between p-8 md:p-10"
        >
          <div>
            <div className="flex flex-wrap gap-3">
              <span className="data-chip">WIX HEADLESS AUTH</span>
              <span className="data-chip">LOYALTY OPERATING SYSTEM</span>
            </div>
            <h1 className="mt-6 max-w-4xl text-4xl uppercase leading-[0.9] tracking-[0.14em] text-white md:text-6xl">
              THE GRID
            </h1>
            <p className="mt-4 max-w-2xl text-sm uppercase tracking-[0.34em] text-grid-cyan/80">
              THIS IS NOT FASHION. THIS IS A SYSTEM.
            </p>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                <p className="panel-title">ACCESS</p>
                <p className="mt-3 text-lg font-semibold text-white">Member Vault</p>
                <p className="mt-2 text-sm text-grid-muted">OAuth entry through Wix Headless.</p>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                <p className="panel-title">LEDGER</p>
                <p className="mt-3 text-lg font-semibold text-white">Cred Engine</p>
                <p className="mt-2 text-sm text-grid-muted">Spend, bonuses, tiers, sync and redemption.</p>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                <p className="panel-title">SECURITY</p>
                <p className="mt-3 text-lg font-semibold text-white">Backend Locked</p>
                <p className="mt-2 text-sm text-grid-muted">Admin keys never leave the server boundary.</p>
              </div>
            </div>
            <p className="mt-8 max-w-2xl text-base leading-7 text-grid-muted">
              A high-signal rewards cockpit for fashion-tech members. Sign in with your Wix identity to unlock
              purchase-linked Creds, annual birthday boosts, dynamic tier elevation, and coupon redemptions
              orchestrated through the secure backend.
            </p>
          </div>

          <div className="mt-12 flex flex-wrap items-center gap-4">
            <button onClick={onLogin} className="grid-button min-w-52">
              Sign In To Enter
            </button>
            <span className="data-chip">Secure session cookies</span>
            <span className="data-chip">Backend-only API keys</span>
          </div>
        </motion.section>

        <motion.aside
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="panel-shell p-8"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="panel-title">SYSTEM STATUS</p>
              <h2 className="mt-3 text-2xl uppercase tracking-[0.18em] text-white">Neural Sync Online</h2>
            </div>
            <span className="data-chip">24 HR LEDGER CYCLE</span>
          </div>

          <div className="mt-6 space-y-4 text-sm text-grid-muted">
            <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.32em] text-grid-cyan/80">Cred Protocol</p>
              <p className="mt-3 leading-7">
                ₹1 spent = 1 Cred, with welcome and birthday rewards persisted in the loyalty database.
              </p>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.32em] text-grid-cyan/80">Live Sync</p>
              <p className="mt-3 leading-7">
                Member data can be refreshed on demand and also reconverges through a scheduled server sync.
              </p>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.32em] text-grid-cyan/80">Redeem Engine</p>
              <p className="mt-3 leading-7">
                100 Creds convert to ₹1 with backend coupon tracking and audit-friendly reward records.
              </p>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-black/30 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.32em] text-grid-magenta/80">Clearance Tiers</p>
                <span className="h-2.5 w-2.5 rounded-full bg-grid-magenta shadow-[0_0_16px_rgba(255,79,216,0.9)]" />
              </div>
              <p className="mt-3 text-sm leading-7 text-grid-muted">
                THE_GLITCH → NETRUNNER → SYS-ADMIN → THE_ARCHITECT → THE_SINGULARITY
              </p>
            </div>
          </div>
        </motion.aside>
      </div>
    </div>
  );
}

export function GridExperience() {
  const [dashboard, setDashboard] = useState<GridDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credsInput, setCredsInput] = useState("1000");
  const [latestCoupon, setLatestCoupon] = useState<GridCouponRecord | null>(null);

  function handleLogin() {
    const returnTo =
      typeof window === "undefined" ? "/" : encodeURIComponent(window.location.href);
    window.location.assign(`${API_BASE_URL}/api/auth/login?returnTo=${returnTo}`);
  }

  async function loadDashboard() {
    try {
      setLoading(true);
      setError(null);
      const data = await gridFetch<GridDashboardData>("/api/dashboard");
      setDashboard(data);
      setAuthRequired(false);
    } catch (reason) {
      const nextError = reason instanceof Error ? reason.message : "Could not load dashboard.";
      const status = (reason as Error & { status?: number })?.status;

      if (status === 401) {
        setAuthRequired(true);
        setDashboard(null);
      } else {
        setError(nextError);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  async function handleSync() {
    try {
      setSyncing(true);
      setError(null);
      const payload = await gridFetch<{ dashboard: GridDashboardData }>("/api/sync", {
        method: "POST"
      });
      setDashboard(payload.dashboard);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleRedeem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setRedeeming(true);
      setError(null);
      const payload = await gridFetch<{ dashboard: GridDashboardData; coupon: GridCouponRecord }>("/api/redeem", {
        method: "POST",
        body: JSON.stringify({
          creds: Number(credsInput)
        })
      });
      setDashboard(payload.dashboard);
      setLatestCoupon(payload.coupon);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Redemption failed.");
    } finally {
      setRedeeming(false);
    }
  }

  async function handleLogout() {
    try {
      await gridFetch("/api/auth/logout", { method: "POST" });
      setDashboard(null);
      setAuthRequired(true);
      setLatestCoupon(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not sign out.");
    }
  }

  if (loading && !dashboard) {
    return (
      <main className="relative flex min-h-screen items-center justify-center px-6 py-16">
        <HologramScene />
        <div className="panel-shell z-10 max-w-lg">
          <p className="panel-title">BOOT SEQUENCE</p>
          <h1 className="mt-4 text-3xl uppercase tracking-[0.16em]">THE GRID</h1>
          <p className="mt-4 text-sm text-grid-muted">
            Calibrating loyalty ledger, secure tunnels, and holographic overlays.
          </p>
          <div className="mt-8 h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-full origin-left animate-pulseLine bg-gradient-to-r from-grid-cyan via-grid-blue to-grid-magenta" />
          </div>
        </div>
      </main>
    );
  }

  if (authRequired || !dashboard) {
    return (
      <main className="relative min-h-screen overflow-hidden">
        <HologramScene />
        {error ? (
          <div className="absolute right-6 top-6 z-20 rounded-2xl border border-amber-300/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {error}
          </div>
        ) : null}
        <LoginScreen onLogin={handleLogin} />
      </main>
    );
  }

  const redeemPreview = Number.isFinite(Number(credsInput)) ? credsToRupees(Number(credsInput)) : 0;

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-4 md:px-6 md:py-6">
      <HologramScene />

      <div className="relative z-10 mx-auto flex max-w-7xl flex-col gap-6">
        <motion.header
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="panel-shell flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"
        >
          <div>
            <p className="panel-title">THE GRID</p>
            <h1 className="mt-3 text-3xl uppercase tracking-[0.18em] text-white md:text-5xl">THE GRID</h1>
            <p className="mt-3 text-xs uppercase tracking-[0.32em] text-grid-cyan/80">
              THIS IS NOT FASHION. THIS IS A SYSTEM.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="data-chip">Ledger Sync: {dashboard.system.syncWindowLabel}</span>
            <span className="data-chip">Last Sync: {formatDate(dashboard.system.syncedAt)}</span>
            <button className="grid-button-ghost" onClick={handleLogout}>
              Exit Session
            </button>
          </div>
        </motion.header>

        {error ? (
          <div className="rounded-2xl border border-amber-300/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {error}
          </div>
        ) : null}

        {latestCoupon ? (
          <div className="rounded-2xl border border-grid-cyan/30 bg-gradient-to-r from-grid-cyan/10 to-grid-magenta/10 px-4 py-3 text-sm text-grid-text shadow-neon">
            Redemption issued: {formatCouponLabel(latestCoupon)}
            {latestCoupon.note ? ` · ${latestCoupon.note}` : ""}
          </div>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.05 }}
            className="panel-shell"
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="panel-title">USER PANEL</p>
                <h2 className="mt-3 text-2xl uppercase tracking-[0.16em] text-white md:text-3xl">
                  {dashboard.member.username}
                </h2>
                <p className="mt-2 text-sm text-grid-muted">{dashboard.member.email}</p>
              </div>
              <div className="rounded-3xl border border-grid-cyan/20 bg-black/20 px-5 py-4">
                <p className="text-[10px] uppercase tracking-[0.34em] text-grid-cyan/80">Clearance Level</p>
                <p className="mt-3 font-[var(--font-display)] text-lg uppercase tracking-[0.18em] text-white">
                  {dashboard.wallet.level.label}
                </p>
                <p className="mt-2 text-xs text-grid-muted">{dashboard.wallet.level.mantra}</p>
              </div>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-[26px] border border-white/10 bg-black/20 p-5">
                <p className="panel-title">AVAILABLE CREDS</p>
                <div className="mt-4 text-4xl font-semibold tracking-[0.06em] text-white md:text-6xl">
                  <AnimatedCounter value={dashboard.wallet.availableCreds} />
                </div>
                <p className="mt-4 text-sm text-grid-muted">
                  Lifetime {formatCompactNumber(dashboard.wallet.lifetimeCreds)} Creds · Redeemed{" "}
                  {formatCompactNumber(dashboard.wallet.redeemedCreds)}
                </p>
              </div>

              <div className="grid gap-4">
                <div className="rounded-[26px] border border-white/10 bg-black/20 p-5">
                  <p className="panel-title">PURCHASE VALUE</p>
                  <p className="mt-4 text-2xl font-semibold text-white">
                    {formatIndianCurrency(dashboard.wallet.totalPurchaseValue)}
                  </p>
                </div>
                <div className="rounded-[26px] border border-white/10 bg-black/20 p-5">
                  <p className="panel-title">BONUS CREDS</p>
                  <p className="mt-4 text-2xl font-semibold text-white">{dashboard.wallet.bonusCreds.toLocaleString("en-IN")}</p>
                </div>
              </div>
            </div>

            <div className="mt-8 rounded-[26px] border border-white/10 bg-black/20 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="panel-title">LEVEL PROGRESSION</p>
                  <p className="mt-2 text-sm text-grid-muted">
                    {dashboard.wallet.nextLevel
                  ? `${dashboard.wallet.credsToNextLevel.toLocaleString("en-IN")} Creds to ${dashboard.wallet.nextLevel.label}`
                      : "You are operating at the apex tier."}
                  </p>
                </div>
                <span className="data-chip">{Math.round(dashboard.wallet.progressRatio * 100)}% charged</span>
              </div>
              <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${dashboard.wallet.progressRatio * 100}%` }}
                  transition={{ duration: 0.9, ease: "easeOut" }}
                  className="h-full rounded-full bg-gradient-to-r from-grid-cyan via-grid-blue to-grid-magenta"
                />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.1 }}
            className="grid gap-6"
          >
            <section className="panel-shell">
              <p className="panel-title">REDEEM PANEL</p>
              <h2 className="mt-3 text-xl uppercase tracking-[0.16em] text-white">Convert Creds To Currency</h2>
              <p className="mt-3 text-sm leading-7 text-grid-muted">
                Every 100 Creds convert to ₹1. Coupons are created and tracked through the backend redemption ledger.
              </p>

              <form className="mt-6 space-y-4" onSubmit={handleRedeem}>
                <label className="block">
                  <span className="mb-2 block text-[11px] uppercase tracking-[0.32em] text-grid-muted">Cred Input</span>
                  <input
                    className="grid-input"
                    inputMode="numeric"
                    min={100}
                    step={100}
                    value={credsInput}
                    onChange={(event) => setCredsInput(event.target.value)}
                    placeholder="Enter Creds"
                  />
                </label>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-[11px] uppercase tracking-[0.32em] text-grid-muted">Conversion Output</p>
                  <p className="mt-3 text-2xl font-semibold text-white">{formatIndianCurrency(redeemPreview)}</p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button className="grid-button" disabled={redeeming}>
                    {redeeming ? "Generating..." : "Generate Coupon"}
                  </button>
                  <button className="grid-button-ghost" type="button" disabled={syncing} onClick={handleSync}>
                    {syncing ? "Syncing..." : "Manual Refresh"}
                  </button>
                </div>
              </form>
            </section>

            <section className="panel-shell">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="panel-title">SYSTEM STATUS</p>
                  <h3 className="mt-3 text-lg uppercase tracking-[0.16em] text-white">Ledger Sync: 24-48 hrs</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-grid-cyan shadow-[0_0_18px_rgba(77,247,255,0.9)]" />
                  <span className="text-[11px] uppercase tracking-[0.32em] text-grid-cyan/80">
                    {dashboard.system.connection}
                  </span>
                </div>
              </div>
              <p className="mt-4 text-sm text-grid-muted">Last confirmed backend sync at {formatDate(dashboard.system.syncedAt)}.</p>
            </section>
          </motion.div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.15 }}
            className="panel-shell"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="panel-title">ORDER HISTORY</p>
                <h3 className="mt-3 text-xl uppercase tracking-[0.16em] text-white">Recent Transactions</h3>
              </div>
              <span className="data-chip">{dashboard.orders.length} records</span>
            </div>

            <div className="mt-6 space-y-3">
              {dashboard.orders.length > 0 ? (
                dashboard.orders.map((order) => (
                  <div key={order.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">Order #{order.number}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.24em] text-grid-muted">
                          {order.status} · {order.paymentStatus}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-white">{formatIndianCurrency(order.total)}</p>
                        <p className="mt-1 text-xs text-grid-muted">{formatDate(order.purchasedDate)}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-sm text-grid-muted">
                      {order.items.length > 0 ? order.items.join(" · ") : "No line item titles returned by Wix."}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-grid-muted">
                  No synced orders yet. Trigger a manual refresh after your first Wix order lands.
                </div>
              )}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.2 }}
            className="grid gap-6"
          >
            <section className="panel-shell">
              <div className="flex items-center justify-between">
                <div>
                  <p className="panel-title">LEADERBOARD</p>
                  <h3 className="mt-3 text-xl uppercase tracking-[0.16em] text-white">Top Grid Nodes</h3>
                </div>
                <span className="data-chip">Preferred</span>
              </div>

              <div className="mt-6 space-y-3">
                {dashboard.leaderboard.map((entry, index) => (
                  <div key={entry.memberId} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-grid-cyan/20 bg-grid-cyan/10 font-[var(--font-display)] text-sm text-white">
                        {String(index + 1).padStart(2, "0")}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{entry.username}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.24em] text-grid-muted">{entry.level}</p>
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-white">{entry.lifetimeCreds.toLocaleString("en-IN")} C</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel-shell">
              <div className="flex items-center justify-between">
                <div>
                  <p className="panel-title">COUPON LEDGER</p>
                  <h3 className="mt-3 text-xl uppercase tracking-[0.16em] text-white">Issued Rewards</h3>
                </div>
                <span className="data-chip">{dashboard.coupons.length} tracked</span>
              </div>

              <div className="mt-6 space-y-3">
                {dashboard.coupons.length > 0 ? (
                  dashboard.coupons.map((coupon) => (
                    <div key={coupon.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-white">{coupon.code}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.24em] text-grid-muted">{coupon.status}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-white">{formatIndianCurrency(coupon.valueRupees)}</p>
                          <p className="mt-1 text-xs text-grid-muted">{coupon.credsSpent.toLocaleString("en-IN")} Creds</p>
                        </div>
                      </div>
                      <p className="mt-3 text-xs text-grid-muted">{formatDate(coupon.createdAt)}</p>
                      {coupon.note ? <p className="mt-2 text-xs text-amber-100/90">{coupon.note}</p> : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-grid-muted">
                    No coupons have been issued yet. Redeem Creds to generate the first code.
                  </div>
                )}
              </div>
            </section>
          </motion.div>
        </section>
      </div>
    </main>
  );
}
