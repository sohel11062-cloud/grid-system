"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence, useInView } from "framer-motion";

import {
  credsToRupees,
  formatCompactNumber,
  formatIndianCurrency,
  type GridCouponRecord,
  type GridDashboardData,
} from "@/lib/grid";
import { AnimatedCounter } from "@/components/animated-counter";
import { TerminalText } from "@/components/terminal-text";
import { TiltCard } from "@/components/tilt-card";
import { BootSequence } from "@/components/boot-sequence";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

const HologramScene = dynamic(
  () => import("@/components/hologram-scene").then((m) => m.HologramScene),
  {
    ssr: false,
    loading: () => <div className="pointer-events-none fixed inset-0 bg-grid-bg" aria-hidden="true" />,
  }
);

// ─── Fetch helper ──────────────────────────────────────────────────────────────

async function gridFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null) as { error?: string } | null;
    const err = new Error(payload?.error ?? `Request failed — HTTP ${res.status}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

// ─── Formatters ────────────────────────────────────────────────────────────────

function fmtDate(v: string | null | undefined) {
  if (!v) return "Awaiting signal";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(v));
}

// ─── Motion presets ────────────────────────────────────────────────────────────

const easeSpring = [0.34, 1.56, 0.64, 1] as const;
const easeSmooth = [0.22, 1, 0.36, 1] as const;

const fadeInUp = (delay = 0) => ({
  initial: { opacity: 0, y: 28 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, duration: 0.65, ease: easeSmooth },
});

const revealInView = {
  initial: { opacity: 0, y: 36 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.7, ease: easeSmooth },
};

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: "ONLINE" | "DEGRADED" | "SYNCING" }) {
  const dotCls =
    status === "ONLINE"    ? "status-dot-online"   :
    status === "SYNCING"   ? "status-dot-syncing"  :
                             "status-dot-degraded";
  const labelCls =
    status === "ONLINE"    ? "text-grid-cyan/80"   :
    status === "SYNCING"   ? "text-amber-300/80"   :
                             "text-red-400/80";
  return (
    <div className="flex items-center gap-2">
      <span className={dotCls} />
      <span className={`text-[11px] uppercase tracking-[0.34em] ${labelCls}`}>{status}</span>
    </div>
  );
}

function CouponStatusBadge({ status }: { status: GridCouponRecord["status"] }) {
  const cls =
    status === "ACTIVE"     ? "text-grid-cyan/80"    :
    status === "LOCAL_ONLY" ? "text-amber-300/80"    :
    status === "FAILED"     ? "text-red-400/80"      :
    status === "REDEEMED"   ? "text-grid-violet/80"  :
                              "text-grid-muted";
  return <p className={`mt-1 text-[10px] uppercase tracking-[0.28em] ${cls}`}>{status}</p>;
}

// ─── Login screen ──────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="relative z-10 flex min-h-screen items-center px-6 py-16">
      <div className="mx-auto grid w-full max-w-6xl gap-8 xl:grid-cols-[1.2fr_0.8fr]">

        <motion.section {...fadeInUp(0)} className="panel-shell flex flex-col justify-between p-8 md:p-10">
          <div>
            <div className="flex flex-wrap gap-3">
              <span className="data-chip">WIX HEADLESS AUTH</span>
              <span className="data-chip">LOYALTY OPERATING SYSTEM</span>
            </div>

            <h1
              className="glitch-text mt-6 max-w-4xl text-4xl uppercase leading-[0.9] tracking-[0.14em] text-white md:text-6xl"
              data-text="THE GRID"
            >
              THE GRID
            </h1>

            <p className="mt-4 text-sm uppercase tracking-[0.34em] text-grid-cyan/80">
              <TerminalText text="THIS IS NOT FASHION. THIS IS A SYSTEM." speed={36} delay={900} />
            </p>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {[
                { label: "ACCESS",   title: "Member Vault",   desc: "OAuth entry through Wix Headless." },
                { label: "LEDGER",   title: "Cred Engine",    desc: "Spend, bonuses, tiers, sync and redemption." },
                { label: "SECURITY", title: "Backend Locked", desc: "Admin keys never leave the server boundary." },
              ].map((card, i) => (
                <TiltCard key={card.label} intensity={5} className="p-4">
                  <p className="panel-title">{card.label}</p>
                  <p className="mt-3 text-lg font-semibold text-white">{card.title}</p>
                  <p className="mt-2 text-sm text-grid-muted">{card.desc}</p>
                </TiltCard>
              ))}
            </div>

            <p className="mt-8 max-w-2xl text-base leading-7 text-grid-muted">
              A high-signal rewards cockpit for fashion-tech members. Sign in with your Wix identity
              to unlock purchase-linked Creds, annual birthday boosts, dynamic tier elevation, and
              coupon redemptions orchestrated through the secure backend.
            </p>
          </div>

          <div className="mt-12 flex flex-wrap items-center gap-4">
            <motion.button
              whileHover={{ scale: 1.04, y: -2 }}
              whileTap={{ scale: 0.96 }}
              onClick={onLogin}
              className="grid-button min-w-52"
            >
              Sign In To Enter
            </motion.button>
            <span className="data-chip">Encrypted session cookies</span>
            <span className="data-chip">Backend-only API keys</span>
          </div>
        </motion.section>

        <motion.aside {...fadeInUp(0.12)} className="panel-shell p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="panel-title">SYSTEM STATUS</p>
              <h2 className="mt-3 text-2xl uppercase tracking-[0.18em] text-white">Neural Sync Online</h2>
            </div>
            <span className="data-chip">24 HR CYCLE</span>
          </div>

          <div className="mt-6 space-y-3 text-sm text-grid-muted">
            {[
              { label: "CRED PROTOCOL", text: "₹1 spent = 1 Cred, with welcome and birthday rewards persisted in the loyalty database." },
              { label: "LIVE SYNC",     text: "Member data refreshes on demand and reconverges through a scheduled server cycle." },
              { label: "REDEEM ENGINE", text: "100 Creds convert to ₹1 with backend coupon tracking and audit-friendly reward records." },
            ].map((item) => (
              <motion.div
                key={item.label}
                whileHover={{ x: 4 }}
                transition={{ type: "spring", stiffness: 300, damping: 24 }}
                className="rounded-[22px] border border-white/10 bg-white/5 p-4"
              >
                <p className="panel-kicker">{item.label}</p>
                <p className="mt-2 leading-7">{item.text}</p>
              </motion.div>
            ))}

            <div className="rounded-[22px] border border-white/10 bg-black/30 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.32em] text-grid-magenta/80">CLEARANCE TIERS</p>
                <span className="status-dot-online" />
              </div>
              <p className="mt-2 text-sm leading-7">
                THE_GLITCH → NETRUNNER → SYS-ADMIN → THE_ARCHITECT → THE_SINGULARITY
              </p>
            </div>
          </div>
        </motion.aside>
      </div>
    </div>
  );
}

// ─── Loading screen ────────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <main className="relative flex min-h-screen items-center justify-center px-6 py-16">
      <HologramScene />
      <div className="panel-shell z-10 max-w-lg">
        <p className="panel-title">BOOT SEQUENCE</p>
        <h1 className="mt-4 text-3xl uppercase tracking-[0.16em]">THE GRID</h1>
        <p className="mt-4 text-sm text-grid-muted">
          Calibrating loyalty ledger, secure tunnels, and holographic overlays.
        </p>
        <div className="progress-track mt-8">
          <div className="progress-fill animate-pulseLine w-full">
            <span className="progress-orb" />
          </div>
        </div>
      </div>
    </main>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function GridExperience() {
  const [dashboard, setDashboard]       = useState<GridDashboardData | null>(null);
  const [loading, setLoading]           = useState(true);
  const [syncing, setSyncing]           = useState(false);
  const [redeeming, setRedeeming]       = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [credsInput, setCredsInput]     = useState("1000");
  const [latestCoupon, setLatestCoupon] = useState<GridCouponRecord | null>(null);

  // Boot sequence — shows once per browser session
  const [showBoot, setShowBoot] = useState(false);
  const [bootDone, setBootDone] = useState(false);

  useEffect(() => {
    const already = sessionStorage.getItem("grid_booted");
    if (!already) setShowBoot(true);
    else setBootDone(true);
  }, []);

  const handleBootComplete = useCallback(() => {
    sessionStorage.setItem("grid_booted", "1");
    setShowBoot(false);
    setBootDone(true);
  }, []);

  // Refs for scroll reveal
  const ordersRef    = useRef<HTMLDivElement>(null);
  const leaderRef    = useRef<HTMLDivElement>(null);
  const ordersInView = useInView(ordersRef, { once: true, margin: "-60px" });
  const leaderInView = useInView(leaderRef, { once: true, margin: "-60px" });

  function handleLogin() {
    const returnTo = typeof window !== "undefined" ? encodeURIComponent(window.location.href) : "/";
    window.location.assign(`${API_BASE_URL}/api/auth/login?returnTo=${returnTo}`);
  }

  async function loadDashboard() {
    try {
      setLoading(true); setError(null);
      const data = await gridFetch<GridDashboardData>("/api/dashboard");
      setDashboard(data); setAuthRequired(false);
    } catch (e) {
      if ((e as Error & { status?: number }).status === 401) {
        setAuthRequired(true); setDashboard(null);
      } else {
        setError(e instanceof Error ? e.message : "Could not load dashboard.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadDashboard(); }, []);

  async function handleSync() {
    try {
      setSyncing(true); setError(null);
      const p = await gridFetch<{ dashboard: GridDashboardData }>("/api/sync", { method: "POST" });
      setDashboard(p.dashboard);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleRedeem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      setRedeeming(true); setError(null);
      const p = await gridFetch<{ dashboard: GridDashboardData; coupon: GridCouponRecord }>("/api/redeem", {
        method: "POST",
        body: JSON.stringify({ creds: Number(credsInput) }),
      });
      setDashboard(p.dashboard);
      setLatestCoupon(p.coupon);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Redemption failed.");
    } finally {
      setRedeeming(false);
    }
  }

  async function handleLogout() {
    try {
      await gridFetch("/api/auth/logout", { method: "POST" });
      setDashboard(null); setAuthRequired(true); setLatestCoupon(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign out.");
    }
  }

  const redeemPreview = Number.isFinite(Number(credsInput)) ? credsToRupees(Number(credsInput)) : 0;
  const canShowMain = bootDone;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Boot sequence overlay */}
      {showBoot && <BootSequence onComplete={handleBootComplete} />}

      {canShowMain && (
        <>
          {loading && !dashboard ? (
            <LoadingScreen />
          ) : authRequired || !dashboard ? (
            <main className="relative min-h-screen overflow-hidden">
              <HologramScene />
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                    className="absolute right-6 top-6 z-20 rounded-2xl border border-amber-300/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
                  >
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>
              <LoginScreen onLogin={handleLogin} />
            </main>
          ) : (
            <main className="relative min-h-screen overflow-hidden px-4 py-4 md:px-6 md:py-6">
              <HologramScene />

              <div className="relative z-10 mx-auto flex max-w-7xl flex-col gap-6">

                {/* ── Header ───────────────────────────────────────────── */}
                <motion.header
                  {...fadeInUp(0)}
                  className="panel-shell flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div>
                    <p className="panel-title">THE GRID — LOYALTY OS</p>
                    <h1
                      className="glitch-text mt-3 text-3xl uppercase tracking-[0.18em] text-white md:text-5xl"
                      data-text="THE GRID"
                    >
                      THE GRID
                    </h1>
                    <p className="mt-3 text-xs uppercase tracking-[0.34em] text-grid-cyan/80">
                      <TerminalText text="THIS IS NOT FASHION. THIS IS A SYSTEM." speed={30} delay={200} />
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="data-chip">Sync: {dashboard.system.syncWindowLabel}</span>
                    <span className="data-chip">Last: {fmtDate(dashboard.system.syncedAt)}</span>
                    <motion.button
                      whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.96 }}
                      className="grid-button-ghost" onClick={handleLogout}
                    >
                      Exit Session
                    </motion.button>
                  </div>
                </motion.header>

                {/* ── Banners ───────────────────────────────────────────── */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className="rounded-2xl border border-amber-300/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
                    >
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {latestCoupon && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className="rounded-2xl border border-grid-cyan/30 bg-gradient-to-r from-grid-cyan/10 to-grid-magenta/10 px-4 py-3 text-sm text-grid-text"
                      style={{ boxShadow: "0 0 0 1px rgba(77,247,255,0.2),0 0 40px rgba(77,247,255,0.1)" }}
                    >
                      <span className="font-semibold text-grid-cyan">Coupon issued:</span>{" "}
                      <span className="font-mono">{latestCoupon.code}</span>
                      {" "}·{" "}{formatIndianCurrency(latestCoupon.valueRupees)}
                      {latestCoupon.status === "FAILED" && (
                        <span className="ml-2 text-red-400/90">
                          (Creation failed — no Creds deducted)
                        </span>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ── Main 2-col ────────────────────────────────────────── */}
                <section className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">

                  {/* Left: Member + Wallet */}
                  <motion.div {...fadeInUp(0.08)}>
                    <TiltCard intensity={6}>
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="panel-title">USER PANEL</p>
                          <h2 className="mt-3 text-2xl uppercase tracking-[0.16em] text-white md:text-3xl">
                            {dashboard.member.username}
                          </h2>
                          <p className="mt-2 text-sm text-grid-muted">{dashboard.member.email}</p>
                        </div>
                        <motion.div
                          whileHover={{ scale: 1.04 }}
                          className="rounded-[22px] border border-grid-cyan/20 bg-black/20 px-5 py-4"
                        >
                          <p className="text-[10px] uppercase tracking-[0.36em] text-grid-cyan/80">Clearance Level</p>
                          <p className="mt-3 font-[var(--font-display)] text-lg uppercase tracking-[0.18em] text-white">
                            {dashboard.wallet.level.label}
                          </p>
                          <p className="mt-1 text-xs italic text-grid-muted">{dashboard.wallet.level.mantra}</p>
                        </motion.div>
                      </div>

                      {/* Creds + purchase */}
                      <div className="mt-8 grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
                        <motion.div
                          whileHover={{ scale: 1.015 }}
                          transition={{ type: "spring", stiffness: 280, damping: 22 }}
                          className="rounded-[24px] border border-white/10 bg-black/20 p-5"
                        >
                          <p className="panel-title">AVAILABLE CREDS</p>
                          <div className="mt-4 text-4xl font-semibold tracking-[0.05em] text-white md:text-6xl">
                            <AnimatedCounter value={dashboard.wallet.availableCreds} />
                          </div>
                          <p className="mt-3 text-sm text-grid-muted">
                            Lifetime {formatCompactNumber(dashboard.wallet.lifetimeCreds)} · Redeemed {formatCompactNumber(dashboard.wallet.redeemedCreds)}
                          </p>
                        </motion.div>

                        <div className="grid gap-4">
                          {[
                            { label: "PURCHASE VALUE", value: <AnimatedCounter value={dashboard.wallet.totalPurchaseValue} formatter={(v) => formatIndianCurrency(Math.round(v))} /> },
                            { label: "BONUS CREDS",    value: <AnimatedCounter value={dashboard.wallet.bonusCreds} /> },
                          ].map((item) => (
                            <motion.div
                              key={item.label}
                              whileHover={{ scale: 1.015 }}
                              transition={{ type: "spring", stiffness: 280, damping: 22 }}
                              className="rounded-[24px] border border-white/10 bg-black/20 p-5"
                            >
                              <p className="panel-title">{item.label}</p>
                              <p className="mt-4 text-2xl font-semibold text-white">{item.value}</p>
                            </motion.div>
                          ))}
                        </div>
                      </div>

                      {/* Progress */}
                      <div className="mt-8 rounded-[24px] border border-white/10 bg-black/20 p-5">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="panel-title">LEVEL PROGRESSION</p>
                            <p className="mt-2 text-sm text-grid-muted">
                              {dashboard.wallet.nextLevel
                                ? `${dashboard.wallet.credsToNextLevel.toLocaleString("en-IN")} Creds to ${dashboard.wallet.nextLevel.label}`
                                : "Apex tier reached. System and self are one."}
                            </p>
                          </div>
                          <span className="data-chip">{Math.round(dashboard.wallet.progressRatio * 100)}%</span>
                        </div>
                        <div className="progress-track mt-5">
                          <motion.div
                            className="progress-fill"
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.max(dashboard.wallet.progressRatio * 100, 2)}%` }}
                            transition={{ duration: 1.2, ease: easeSmooth }}
                          >
                            {dashboard.wallet.progressRatio > 0.02 && <span className="progress-orb" />}
                          </motion.div>
                        </div>
                      </div>
                    </TiltCard>
                  </motion.div>

                  {/* Right: Redeem + Status */}
                  <motion.div {...fadeInUp(0.14)} className="grid gap-6">

                    <TiltCard intensity={5}>
                      <p className="panel-title">REDEEM PANEL</p>
                      <h2 className="mt-3 text-xl uppercase tracking-[0.16em] text-white">Convert Creds</h2>
                      <p className="mt-3 text-sm leading-7 text-grid-muted">
                        100 Creds = ₹1. Coupons created via Wix API and tracked in the backend ledger.
                        Creds are only deducted on confirmed coupon creation.
                      </p>

                      <form className="mt-6 space-y-4" onSubmit={handleRedeem}>
                        <label className="block">
                          <span className="mb-2 block text-[11px] uppercase tracking-[0.34em] text-grid-muted">
                            Cred Input (multiples of 100)
                          </span>
                          <input
                            className="grid-input"
                            inputMode="numeric"
                            min={100}
                            step={100}
                            value={credsInput}
                            onChange={(e) => setCredsInput(e.target.value)}
                            placeholder="e.g. 1000"
                          />
                        </label>

                        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                          <p className="text-[11px] uppercase tracking-[0.34em] text-grid-muted">
                            Conversion Output
                          </p>
                          <p className="mt-3 text-2xl font-semibold text-white">
                            {formatIndianCurrency(redeemPreview)}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                          <motion.button
                            whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.96 }}
                            className="grid-button" disabled={redeeming}
                          >
                            {redeeming ? "Generating..." : "Generate Coupon"}
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.03, y: -1 }} whileTap={{ scale: 0.96 }}
                            type="button" className="grid-button-ghost" disabled={syncing} onClick={handleSync}
                          >
                            {syncing ? "Syncing..." : "Manual Sync"}
                          </motion.button>
                        </div>
                      </form>
                    </TiltCard>

                    <TiltCard intensity={4}>
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="panel-title">SYSTEM STATUS</p>
                          <h3 className="mt-3 text-lg uppercase tracking-[0.16em] text-white">
                            Ledger: 24-48 hr sync
                          </h3>
                        </div>
                        <StatusDot status={syncing ? "SYNCING" : dashboard.system.connection} />
                      </div>
                      <p className="mt-4 text-sm text-grid-muted">
                        Last backend sync: {fmtDate(dashboard.system.syncedAt)}
                      </p>
                    </TiltCard>
                  </motion.div>
                </section>

                {/* ── Bottom 2-col (scroll-revealed) ───────────────────── */}
                <section className="grid gap-6 lg:grid-cols-2">

                  {/* Orders */}
                  <motion.div
                    ref={ordersRef}
                    initial={{ opacity: 0, y: 40 }}
                    animate={ordersInView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.7, ease: easeSmooth }}
                  >
                    <TiltCard intensity={5}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="panel-title">ORDER HISTORY</p>
                          <h3 className="mt-3 text-xl uppercase tracking-[0.16em] text-white">Recent Transactions</h3>
                        </div>
                        <span className="data-chip">{dashboard.orders.length} orders</span>
                      </div>

                      <div className="mt-6 space-y-3">
                        {dashboard.orders.length > 0 ? (
                          dashboard.orders.map((order, i) => (
                            <motion.div
                              key={order.id}
                              initial={{ opacity: 0, x: -14 }}
                              animate={ordersInView ? { opacity: 1, x: 0 } : {}}
                              transition={{ delay: 0.06 * i, duration: 0.4 }}
                              whileHover={{ x: 5 }}
                              className="rounded-2xl border border-white/10 bg-black/20 p-4"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium text-white">Order #{order.number}</p>
                                  <p className="mt-1 text-[10px] uppercase tracking-[0.26em] text-grid-muted">
                                    {order.status} · {order.paymentStatus}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-semibold text-white">{formatIndianCurrency(order.total)}</p>
                                  <p className="mt-1 text-[10px] text-grid-muted">{fmtDate(order.purchasedDate)}</p>
                                </div>
                              </div>
                              <p className="mt-2 text-sm text-grid-muted">
                                {order.items.length > 0 ? order.items.join(" · ") : "No line items returned."}
                              </p>
                            </motion.div>
                          ))
                        ) : (
                          <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-grid-muted">
                            No synced orders yet. Trigger a manual sync after your first Wix order.
                          </div>
                        )}
                      </div>
                    </TiltCard>
                  </motion.div>

                  {/* Leaderboard + Coupons */}
                  <motion.div
                    ref={leaderRef}
                    initial={{ opacity: 0, y: 40 }}
                    animate={leaderInView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.7, delay: 0.1, ease: easeSmooth }}
                    className="grid gap-6"
                  >
                    <TiltCard intensity={4}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="panel-title">LEADERBOARD</p>
                          <h3 className="mt-3 text-xl uppercase tracking-[0.16em] text-white">Top Grid Nodes</h3>
                        </div>
                        <span className="data-chip">Top {dashboard.leaderboard.length}</span>
                      </div>

                      <div className="mt-6 space-y-3">
                        {dashboard.leaderboard.length > 0 ? (
                          dashboard.leaderboard.map((entry, i) => (
                            <motion.div
                              key={entry.memberId}
                              initial={{ opacity: 0, x: 14 }}
                              animate={leaderInView ? { opacity: 1, x: 0 } : {}}
                              transition={{ delay: 0.06 * i }}
                              whileHover={{ x: -5 }}
                              className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
                            >
                              <div className="flex items-center gap-4">
                                <div
                                  className={[
                                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-semibold text-white",
                                    i === 0 ? "border-grid-cyan/50 bg-grid-cyan/15" :
                                    i === 1 ? "border-grid-blue/40 bg-grid-blue/12" :
                                              "border-white/10 bg-white/5",
                                  ].join(" ")}
                                >
                                  {String(i + 1).padStart(2, "0")}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-white">{entry.username}</p>
                                  <p className="mt-0.5 text-[10px] uppercase tracking-[0.26em] text-grid-muted">{entry.level}</p>
                                </div>
                              </div>
                              <p className="text-sm font-semibold text-white">
                                {entry.lifetimeCreds.toLocaleString("en-IN")} C
                              </p>
                            </motion.div>
                          ))
                        ) : (
                          <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-grid-muted">
                            Leaderboard populates after first member sync.
                          </div>
                        )}
                      </div>
                    </TiltCard>

                    <TiltCard intensity={4}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="panel-title">COUPON LEDGER</p>
                          <h3 className="mt-3 text-xl uppercase tracking-[0.16em] text-white">Issued Rewards</h3>
                        </div>
                        <span className="data-chip">{dashboard.coupons.length} tracked</span>
                      </div>

                      <div className="mt-6 space-y-3">
                        {dashboard.coupons.length > 0 ? (
                          dashboard.coupons.map((coupon, i) => (
                            <motion.div
                              key={coupon.id}
                              initial={{ opacity: 0 }}
                              animate={leaderInView ? { opacity: 1 } : {}}
                              transition={{ delay: 0.07 * i }}
                              whileHover={{ x: -5 }}
                              className="rounded-2xl border border-white/10 bg-black/20 p-4"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <p className="font-mono text-sm font-medium text-white">{coupon.code}</p>
                                  <CouponStatusBadge status={coupon.status} />
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-semibold text-white">{formatIndianCurrency(coupon.valueRupees)}</p>
                                  <p className="mt-0.5 text-[10px] text-grid-muted">{coupon.credsSpent.toLocaleString("en-IN")} Creds</p>
                                </div>
                              </div>
                              <p className="mt-2 text-[10px] text-grid-muted">{fmtDate(coupon.createdAt)}</p>
                              {coupon.note && (
                                <p className="mt-1.5 text-[10px] text-amber-100/80">{coupon.note}</p>
                              )}
                            </motion.div>
                          ))
                        ) : (
                          <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-grid-muted">
                            No coupons issued yet. Redeem Creds to generate the first code.
                          </div>
                        )}
                      </div>
                    </TiltCard>
                  </motion.div>
                </section>

              </div>
            </main>
          )}
        </>
      )}
    </>
  );
}
