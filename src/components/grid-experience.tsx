"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion, useInView }        from "framer-motion";
import {
  credsToRupees,
  formatCompactNumber,
  formatIndianCurrency,
  type CreditTransaction,
  type GridCouponRecord,
  type GridDashboardData,
} from "@/lib/grid";
import { AnimatedCounter } from "@/components/animated-counter";
import { BootSequence }    from "@/components/boot-sequence";
import { TerminalText }    from "@/components/terminal-text";
import { TiltCard }        from "@/components/tilt-card";

const HologramScene = dynamic(
  () => import("@/components/hologram-scene").then((m) => m.HologramScene),
  { ssr: false, loading: () => <div className="pointer-events-none fixed inset-0" aria-hidden /> },
);

// ─── Fetch helper ─────────────────────────────────────────────────────────────

async function gFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const p = await res.json().catch(() => null) as { error?: string } | null;
    const e = new Error(p?.error ?? `HTTP ${res.status}`);
    (e as Error & { status?: number }).status = res.status;
    throw e;
  }
  return res.json() as Promise<T>;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtDate(v?: string | null) {
  if (!v) return "—";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(v));
}
function fmtShort(v?: string | null) {
  if (!v) return "—";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "short" }).format(new Date(v));
}

const ease    = [0.22, 1, 0.36, 1] as const;
const fadeUp  = (delay = 0) => ({
  initial:    { opacity: 0, y: 20 },
  animate:    { opacity: 1, y: 0 },
  transition: { delay, duration: 0.6, ease },
});

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusDot({ status }: { status: "ONLINE" | "DEGRADED" | "SYNCING" }) {
  const cls = status === "ONLINE"
    ? "status-dot-online"
    : status === "SYNCING"
    ? "status-dot-syncing"
    : "status-dot-degraded";
  const lbl = status === "ONLINE"
    ? "text-emerald-400/80"
    : status === "SYNCING"
    ? "text-amber-300/80"
    : "text-red-400/80";
  return (
    <div className="flex items-center gap-2">
      <span className={cls} />
      <span className={`text-[10px] uppercase tracking-[0.34em] ${lbl}`}>{status}</span>
    </div>
  );
}

function CouponBadge({ status }: { status: GridCouponRecord["status"] }) {
  const cls =
    status === "ACTIVE"  ? "text-grid-cyan/80"   :
    status === "USED"    ? "text-grid-violet/80" :
    status === "EXPIRED" ? "text-amber-300/60"   : "text-red-400/70";
  return <span className={`text-[10px] uppercase tracking-[0.28em] ${cls}`}>{status}</span>;
}

function TxBadge({ type }: { type: CreditTransaction["type"] }) {
  const icon =
    type === "EARN"   ? "▲" :
    type === "BONUS"  ? "★" :
    type === "REDEEM" ? "▼" : "~";
  const cls =
    type === "EARN"   ? "text-grid-cyan"    :
    type === "BONUS"  ? "text-grid-violet"  :
    type === "REDEEM" ? "text-grid-magenta" : "text-grid-muted";
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-[0.26em] ${cls}`}>
      {icon} {type}
    </span>
  );
}

// ─── Login screen ─────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="relative z-10 flex min-h-screen items-center px-5 py-16">
      <div className="mx-auto grid w-full max-w-6xl gap-6 xl:grid-cols-[1.3fr_0.9fr]">
        <motion.section {...fadeUp(0)} className="panel-shell flex flex-col justify-between p-8 md:p-10">
          <div>
            <div className="flex flex-wrap gap-2">
              <span className="data-chip">SECURE AUTH ENGINE</span>
              <span className="data-chip">LOYALTY OPERATING SYSTEM</span>
            </div>
            <h1 className="glitch-text mt-5 text-4xl uppercase leading-[0.9] tracking-[0.14em] text-white md:text-6xl" data-text="THE GRID">
              THE GRID
            </h1>
            <p className="mt-4 text-xs uppercase tracking-[0.34em] text-grid-cyan/80">
              <TerminalText text="THIS IS NOT FASHION. THIS IS A SYSTEM." speed={32} delay={900} />
            </p>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {[
                { lbl: "ACCESS",   title: "Member Vault",   desc: "Secure OAuth entry via Grid System." },
                { lbl: "LEDGER",   title: "Cred Engine",    desc: "Purchases, bonuses, tiers and redemptions." },
                { lbl: "SECURITY", title: "Audit Ledger",   desc: "Every transaction recorded and traceable." },
              ].map((c) => (
                <TiltCard key={c.lbl} intensity={4} className="p-4">
                  <p className="panel-title">{c.lbl}</p>
                  <p className="mt-3 text-base font-semibold text-white">{c.title}</p>
                  <p className="mt-1.5 text-xs text-grid-muted">{c.desc}</p>
                </TiltCard>
              ))}
            </div>
            <p className="mt-7 max-w-2xl text-sm leading-7 text-grid-muted">
              Sign in to unlock purchase-linked Creds, birthday boosts, dynamic tier elevation and
              reward coupon redemptions — all tracked in a tamper-resistant audit ledger.
            </p>
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <motion.button
              whileHover={{ scale: 1.04, y: -2 }}
              whileTap={{ scale: 0.96 }}
              onClick={onLogin}
              className="grid-button min-w-48"
            >
              Sign In To Enter
            </motion.button>
            <span className="data-chip">Encrypted sessions</span>
            <span className="data-chip">Full audit trail</span>
          </div>
        </motion.section>

        <motion.aside {...fadeUp(0.1)} className="panel-shell p-7">
          <p className="panel-title">SYSTEM STATUS</p>
          <h2 className="mt-3 text-xl uppercase tracking-[0.18em] text-white">Grid Online</h2>
          <div className="mt-5 space-y-3 text-sm text-grid-muted">
            {[
              { lbl: "CRED PROTOCOL",  txt: "₹1 spent = 1 Cred, with welcome and birthday bonuses." },
              { lbl: "LIVE SYNC",      txt: "Ledger refreshes on demand and via automated daily sync." },
              { lbl: "REDEEM ENGINE",  txt: "100 Creds = ₹1. Reward coupons issued via Processing Engine." },
              { lbl: "AUDIT LEDGER",   txt: "Every transaction is recorded for full traceability." },
            ].map((item) => (
              <div key={item.lbl} className="rounded-2xl border border-white/8 bg-white/4 p-3">
                <p className="panel-kicker">{item.lbl}</p>
                <p className="mt-1.5 leading-6">{item.txt}</p>
              </div>
            ))}
          </div>
        </motion.aside>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <main className="relative flex min-h-screen items-center justify-center px-6">
      <HologramScene />
      <div className="panel-shell z-10 w-full max-w-sm text-center">
        <p className="panel-title">LOADING</p>
        <h1 className="mt-4 text-2xl uppercase tracking-[0.18em] text-white">THE GRID</h1>
        <div className="progress-track mx-auto mt-8 w-48">
          <div className="progress-fill animate-pulseLine w-full">
            <span className="progress-orb" />
          </div>
        </div>
        <p className="mt-4 text-xs text-grid-muted">Calibrating reward ledger…</p>
      </div>
    </main>
  );
}

// ─── Main experience ──────────────────────────────────────────────────────────

export function GridExperience() {
  const [dashboard, setDashboard]   = useState<GridDashboardData | null>(null);
  const [loading, setLoading]       = useState(true);
  const [authRequired, setAuth]     = useState(false);
  const [syncing, setSyncing]       = useState(false);
  const [redeeming, setRedeeming]   = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [credsInput, setCredsInput] = useState("1000");
  const [latestCoupon, setLatest]   = useState<GridCouponRecord | null>(null);
  const [showTx, setShowTx]         = useState(false);
  const [showBoot, setShowBoot]     = useState(false);
  const [bootDone, setBootDone]     = useState(false);

  useEffect(() => {
    if (!sessionStorage.getItem("grid_booted")) setShowBoot(true);
    else setBootDone(true);
  }, []);

  const onBoot = useCallback(() => {
    sessionStorage.setItem("grid_booted", "1");
    setShowBoot(false);
    setBootDone(true);
  }, []);

  const ordersRef = useRef<HTMLDivElement>(null);
  const txRef     = useRef<HTMLDivElement>(null);
  const cpnRef    = useRef<HTMLDivElement>(null);
  const ordersIn  = useInView(ordersRef, { once: true, margin: "-60px" });
  const txIn      = useInView(txRef,     { once: true, margin: "-60px" });
  const cpnIn     = useInView(cpnRef,    { once: true, margin: "-60px" });

  function login() {
    const ret = typeof window !== "undefined"
      ? encodeURIComponent(window.location.href)
      : "/";
    window.location.assign(`/api/auth/login?returnTo=${ret}`);
  }

  async function load() {
    try {
      setLoading(true); setError(null);
      const d = await gFetch<GridDashboardData>("/api/dashboard");
      setDashboard(d); setAuth(false);
    } catch (e) {
      if ((e as Error & { status?: number }).status === 401) {
        setAuth(true); setDashboard(null);
      } else {
        setError((e as Error).message ?? "Could not load dashboard.");
      }
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSync() {
    try {
      setSyncing(true); setError(null);
      const p = await gFetch<{ dashboard: GridDashboardData }>("/api/sync", { method: "POST" });
      setDashboard(p.dashboard);
    } catch (e) { setError((e as Error).message ?? "Sync failed."); }
    finally     { setSyncing(false); }
  }

  async function handleRedeem(ev: React.FormEvent) {
    ev.preventDefault();
    try {
      setRedeeming(true); setError(null); setLatest(null);
      const p = await gFetch<{ coupon: GridCouponRecord; dashboard: GridDashboardData }>(
        "/api/redeem",
        { method: "POST", body: JSON.stringify({ creds: Number(credsInput) }) },
      );
      setDashboard(p.dashboard);
      setLatest(p.coupon);
    } catch (e) { setError((e as Error).message ?? "Redemption failed."); }
    finally     { setRedeeming(false); }
  }

  async function handleLogout() {
    try {
      await gFetch("/api/auth/logout", { method: "POST" });
      setDashboard(null); setAuth(true); setLatest(null);
    } catch (e) { setError((e as Error).message ?? "Could not end session."); }
  }

  const redeemPreview = Number.isFinite(Number(credsInput))
    ? credsToRupees(Number(credsInput))
    : 0;

  if (showBoot) return <BootSequence onComplete={onBoot} />;
  if (!bootDone) return null;
  if (loading && !dashboard) return <LoadingScreen />;

  if (authRequired || !dashboard) {
    return (
      <main className="relative min-h-screen overflow-hidden">
        <HologramScene />
        <AnimatePresence>
          {error && (
            <motion.div
              key="err"
              initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="fixed right-4 top-4 z-20 rounded-2xl border border-amber-300/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>
        <LoginScreen onLogin={login} />
      </main>
    );
  }

  const d = dashboard;

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-4 md:px-6 md:py-6">
      <HologramScene />
      <div className="relative z-10 mx-auto flex max-w-7xl flex-col gap-6">

        {/* Header */}
        <motion.header {...fadeUp(0)} className="panel-shell flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="panel-title">THE GRID — LOYALTY OS</p>
            <h1 className="glitch-text mt-2 text-3xl uppercase tracking-[0.18em] text-white md:text-5xl" data-text="THE GRID">
              THE GRID
            </h1>
            <p className="mt-2 text-[11px] uppercase tracking-[0.34em] text-grid-cyan/80">
              <TerminalText text="THIS IS NOT FASHION. THIS IS A SYSTEM." speed={28} delay={200} />
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="data-chip">Sync: {d.system.syncWindowLabel}</span>
            <span className="data-chip hidden sm:inline-flex">Last: {fmtDate(d.system.syncedAt)}</span>
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={handleLogout} className="grid-button-ghost text-[10px]">
              Exit Session
            </motion.button>
          </div>
        </motion.header>

        {/* Banners */}
        <AnimatePresence>
          {error && (
            <motion.div key="err" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="rounded-2xl border border-amber-300/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              {error}
            </motion.div>
          )}
          {latestCoupon && (
            <motion.div key="cpn" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="rounded-2xl border border-grid-cyan/25 bg-grid-cyan/8 px-4 py-3 text-sm">
              <span className="font-semibold text-grid-cyan">Reward issued: </span>
              <span className="font-mono text-white">{latestCoupon.code}</span>
              <span className="ml-2 text-grid-muted">· {formatIndianCurrency(latestCoupon.valueRupees)}</span>
              {latestCoupon.expiresAt && (
                <span className="ml-2 text-[11px] text-grid-muted/60">expires {fmtShort(latestCoupon.expiresAt)}</span>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main 2-col */}
        <section className="grid gap-6 xl:grid-cols-[1.4fr_0.95fr]">
          {/* Member + Wallet */}
          <motion.div {...fadeUp(0.07)}>
            <TiltCard intensity={5}>
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="panel-title">USER PANEL</p>
                  <h2 className="mt-3 text-2xl uppercase tracking-[0.16em] text-white md:text-3xl">{d.member.username}</h2>
                  <p className="mt-1.5 text-sm text-grid-muted">{d.member.email}</p>
                </div>
                <div className="rounded-2xl border border-grid-cyan/20 bg-black/20 px-5 py-4 text-center">
                  <p className="text-[10px] uppercase tracking-[0.36em] text-grid-cyan/70">Level</p>
                  <p className="mt-2 text-base uppercase tracking-[0.18em] text-white">{d.wallet.level.label}</p>
                  <p className="mt-1 text-[11px] italic text-grid-muted">{d.wallet.level.mantra}</p>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                  <p className="panel-title">AVAILABLE CREDS</p>
                  <div className="mt-3 text-5xl font-bold tracking-tight text-white">
                    <AnimatedCounter value={d.wallet.availableCreds} />
                  </div>
                  <p className="mt-2 text-[11px] text-grid-muted">
                    Lifetime {formatCompactNumber(d.wallet.lifetimeCreds)} · Redeemed {formatCompactNumber(d.wallet.redeemedCreds)}
                  </p>
                </div>
                <div className="grid gap-4">
                  {[
                    { lbl: "PURCHASE VALUE", val: <AnimatedCounter value={d.wallet.totalPurchaseValue} formatter={(v) => formatIndianCurrency(Math.round(v))} /> },
                    { lbl: "BONUS CREDS",    val: <AnimatedCounter value={d.wallet.bonusCreds} /> },
                  ].map((item) => (
                    <div key={item.lbl} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="panel-title">{item.lbl}</p>
                      <p className="mt-3 text-2xl font-semibold text-white">{item.val}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { lbl: "TOTAL SAVED",  val: formatIndianCurrency(d.lifetimeStats.totalSavingsRupees) },
                  { lbl: "COUPONS USED", val: String(d.lifetimeStats.totalCouponsUsed) },
                  { lbl: "ACTIVE",       val: String(d.lifetimeStats.totalCouponsActive) },
                  { lbl: "EXPIRED",      val: String(d.lifetimeStats.totalCouponsExpired) },
                ].map((s) => (
                  <div key={s.lbl} className="rounded-2xl border border-white/8 bg-black/15 py-3 text-center">
                    <p className="text-[9px] uppercase tracking-[0.36em] text-grid-muted">{s.lbl}</p>
                    <p className="mt-1.5 text-base font-semibold text-white">{s.val}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="panel-title">LEVEL PROGRESSION</p>
                    <p className="mt-1.5 text-xs text-grid-muted">
                      {d.wallet.nextLevel
                        ? `${d.wallet.credsToNextLevel.toLocaleString("en-IN")} Creds to ${d.wallet.nextLevel.label}`
                        : "Apex tier reached. System and self are one."}
                    </p>
                  </div>
                  <span className="data-chip">{Math.round(d.wallet.progressRatio * 100)}%</span>
                </div>
                <div className="progress-track mt-4">
                  <motion.div
                    className="progress-fill"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(d.wallet.progressRatio * 100, 2)}%` }}
                    transition={{ duration: 1.2, ease }}
                  >
                    {d.wallet.progressRatio > 0.02 && <span className="progress-orb" />}
                  </motion.div>
                </div>
              </div>
            </TiltCard>
          </motion.div>

          {/* Redeem + Status */}
          <motion.div {...fadeUp(0.13)} className="grid gap-6">
            <TiltCard intensity={4}>
              <p className="panel-title">REDEEM PANEL</p>
              <h2 className="mt-2 text-lg uppercase tracking-[0.16em] text-white">Convert Creds</h2>
              <p className="mt-2 text-xs leading-6 text-grid-muted">
                100 Creds = ₹1 · Coupons issued via Processing Engine · Creds deducted on confirmation only
              </p>
              <form className="mt-5 space-y-4" onSubmit={handleRedeem}>
                <label className="block">
                  <span className="mb-2 block text-[10px] uppercase tracking-[0.34em] text-grid-muted">Creds (×100)</span>
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
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.34em] text-grid-muted">Output</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{formatIndianCurrency(redeemPreview)}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <motion.button
                    whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.96 }}
                    className="grid-button flex-1" disabled={redeeming}
                  >
                    {redeeming ? "Generating…" : "Generate Coupon"}
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    type="button" className="grid-button-ghost" disabled={syncing} onClick={handleSync}
                  >
                    {syncing ? "Syncing…" : "Grid Sync"}
                  </motion.button>
                </div>
              </form>
            </TiltCard>

            <TiltCard intensity={3}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="panel-title">SYSTEM STATUS</p>
                  <h3 className="mt-2 text-base uppercase tracking-[0.16em] text-white">
                    Ledger: {d.system.syncWindowLabel}
                  </h3>
                </div>
                <StatusDot status={syncing ? "SYNCING" : d.system.connection} />
              </div>
              <p className="mt-3 text-xs text-grid-muted">Last sync: {fmtDate(d.system.syncedAt)}</p>
            </TiltCard>
          </motion.div>
        </section>

        {/* Bottom row */}
        <section className="grid gap-6 lg:grid-cols-2">
          {/* Orders */}
          <motion.div
            ref={ordersRef}
            initial={{ opacity: 0, y: 36 }}
            animate={ordersIn ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.65, ease }}
          >
            <TiltCard intensity={3}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="panel-title">ORDER HISTORY</p>
                  <h3 className="mt-2 text-lg uppercase tracking-[0.16em] text-white">Recent Purchases</h3>
                </div>
                <span className="data-chip">{d.orders.length} orders</span>
              </div>
              <div className="mt-5 space-y-3">
                {d.orders.length > 0 ? d.orders.map((o, i) => (
                  <motion.div
                    key={o.id}
                    initial={{ opacity: 0, x: -12 }} animate={ordersIn ? { opacity: 1, x: 0 } : {}}
                    transition={{ delay: 0.05 * i }} whileHover={{ x: 4 }}
                    className="rounded-2xl border border-white/10 bg-black/20 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-white">Order #{o.number}</p>
                        <p className="mt-0.5 text-[10px] uppercase tracking-[0.22em] text-grid-muted">
                          {o.status} · {o.paymentStatus}
                        </p>
                        {o.couponCode && (
                          <p className="mt-0.5 text-[10px] text-grid-violet/80">Coupon: {o.couponCode}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-white">{formatIndianCurrency(o.total)}</p>
                        <p className="mt-0.5 text-[10px] text-grid-muted">{fmtShort(o.purchasedDate)}</p>
                      </div>
                    </div>
                    {o.items.length > 0 && (
                      <p className="mt-2 truncate text-xs text-grid-muted">{o.items.join(" · ")}</p>
                    )}
                  </motion.div>
                )) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-black/15 p-6 text-center text-sm text-grid-muted">
                    No synced orders yet. Trigger a Grid Sync after your first purchase.
                  </div>
                )}
              </div>
            </TiltCard>
          </motion.div>

          {/* Coupons + Leaderboard */}
          <motion.div
            ref={cpnRef}
            initial={{ opacity: 0, y: 36 }}
            animate={cpnIn ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.65, delay: 0.08, ease }}
            className="flex flex-col gap-6"
          >
            <TiltCard intensity={3}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="panel-title">COUPON LEDGER</p>
                  <h3 className="mt-2 text-lg uppercase tracking-[0.16em] text-white">Reward Coupons</h3>
                </div>
                <span className="data-chip">{d.coupons.length} issued</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  { lbl: "Active",  val: d.lifetimeStats.totalCouponsActive,  cls: "text-grid-cyan/80"  },
                  { lbl: "Used",    val: d.lifetimeStats.totalCouponsUsed,    cls: "text-grid-violet/80" },
                  { lbl: "Expired", val: d.lifetimeStats.totalCouponsExpired, cls: "text-amber-300/70"  },
                ].map((p) => (
                  <span key={p.lbl} className={`data-chip ${p.cls}`}>{p.val} {p.lbl}</span>
                ))}
              </div>
              <div className="mt-4 space-y-3">
                {d.coupons.length > 0 ? d.coupons.slice(0, 4).map((c, i) => (
                  <motion.div
                    key={c.id}
                    initial={{ opacity: 0 }} animate={cpnIn ? { opacity: 1 } : {}}
                    transition={{ delay: 0.06 * i }}
                    className="rounded-2xl border border-white/10 bg-black/20 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-mono text-sm font-medium text-white">{c.code}</p>
                        <CouponBadge status={c.status} />
                        {c.usedAt && <p className="text-[10px] text-grid-muted">Used {fmtShort(c.usedAt)}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-white">{formatIndianCurrency(c.valueRupees)}</p>
                        <p className="text-[10px] text-grid-muted">{c.credsSpent.toLocaleString("en-IN")} Creds</p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <p className="text-[10px] text-grid-muted">{fmtShort(c.createdAt)}</p>
                      {c.expiresAt && c.status === "ACTIVE" && (
                        <p className="text-[10px] text-amber-300/60">expires {fmtShort(c.expiresAt)}</p>
                      )}
                    </div>
                  </motion.div>
                )) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-black/15 p-5 text-center text-sm text-grid-muted">
                    No coupons issued yet.
                  </div>
                )}
              </div>
            </TiltCard>

            <TiltCard intensity={3}>
              <div className="flex items-center justify-between">
                <p className="panel-title">LEADERBOARD</p>
                <span className="data-chip">Top {d.leaderboard.length}</span>
              </div>
              <div className="mt-4 space-y-2.5">
                {d.leaderboard.map((e, i) => (
                  <div key={e.memberId} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold text-white ${i === 0 ? "border-grid-cyan/50 bg-grid-cyan/15" : i === 1 ? "border-grid-violet/40 bg-grid-violet/10" : "border-white/10 bg-white/5"}`}>
                        {i + 1}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{e.username}</p>
                        <p className="text-[10px] uppercase tracking-[0.22em] text-grid-muted">{e.level}</p>
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-white">
                      {e.lifetimeCreds.toLocaleString("en-IN")} C
                    </p>
                  </div>
                ))}
              </div>
            </TiltCard>
          </motion.div>
        </section>

        {/* Transaction history */}
        <motion.div
          ref={txRef}
          initial={{ opacity: 0, y: 36 }}
          animate={txIn ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.65, ease }}
        >
          <TiltCard intensity={2}>
            <div className="flex items-center justify-between">
              <div>
                <p className="panel-title">CREDIT LEDGER</p>
                <h3 className="mt-2 text-lg uppercase tracking-[0.16em] text-white">Transaction History</h3>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="data-chip">{d.recentTransactions.length} recent</span>
                <motion.button
                  whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={() => setShowTx((p) => !p)}
                  className="grid-button-ghost text-[10px]"
                >
                  {showTx ? "Hide" : "Show All"}
                </motion.button>
              </div>
            </div>
            <div className="mt-5">
              {d.recentTransactions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-black/15 p-5 text-center text-sm text-grid-muted">
                  No transactions recorded yet.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {(showTx ? d.recentTransactions : d.recentTransactions.slice(0, 3)).map((tx, i) => (
                    <motion.div
                      key={tx.id}
                      initial={{ opacity: 0, x: 10 }} animate={txIn ? { opacity: 1, x: 0 } : {}}
                      transition={{ delay: 0.04 * i }}
                      className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm ${tx.type === "EARN" ? "bg-grid-cyan/12 text-grid-cyan" : tx.type === "BONUS" ? "bg-grid-violet/12 text-grid-violet" : tx.type === "REDEEM" ? "bg-grid-magenta/12 text-grid-magenta" : "bg-white/5 text-grid-muted"}`}>
                          {tx.type === "EARN" ? "▲" : tx.type === "BONUS" ? "★" : tx.type === "REDEEM" ? "▼" : "~"}
                        </div>
                        <div>
                          <TxBadge type={tx.type} />
                          <p className="mt-0.5 max-w-[180px] truncate text-[10px] text-grid-muted">
                            {tx.description ?? tx.referenceId}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-semibold ${tx.type === "REDEEM" ? "text-grid-magenta" : "text-white"}`}>
                          {tx.type === "REDEEM" ? "-" : "+"}{tx.amount.toLocaleString("en-IN")} C
                        </p>
                        <p className="mt-0.5 text-[10px] text-grid-muted">{fmtShort(tx.createdAt)}</p>
                      </div>
                    </motion.div>
                  ))}
                  {!showTx && d.recentTransactions.length > 3 && (
                    <p
                      className="cursor-pointer text-center text-[10px] uppercase tracking-[0.3em] text-grid-muted/50 transition-colors hover:text-grid-muted"
                      onClick={() => setShowTx(true)}
                    >
                      +{d.recentTransactions.length - 3} more — click to expand
                    </p>
                  )}
                </div>
              )}
            </div>
          </TiltCard>
        </motion.div>
      </div>
    </main>
  );
}
