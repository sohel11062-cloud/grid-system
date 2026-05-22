"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type {
  AdminAction,
  AuditLog,
  GlobalStats,
  GridTierKey,
  GridUser,
  RedemptionRecord,
  SyncJob,
} from "@/lib/grid";
import { formatCompactNumber, formatIndianCurrency } from "@/lib/grid";

const HologramScene = dynamic(
  () => import("@/components/hologram-scene").then((m) => m.HologramScene),
  { ssr: false, loading: () => <div className="pointer-events-none fixed inset-0" aria-hidden /> },
);

interface OverviewPayload {
  admin: { memberId: string; email: string; roles: string[] };
  globalStats: GlobalStats;
  users: GridUser[];
  flaggedUsers: GridUser[];
  redemptions: RedemptionRecord[];
  auditLogs: AuditLog[];
  adminActions: AdminAction[];
  syncJobs: SyncJob[];
}

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
    const body = await res.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function fmtDate(value?: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function idempotencyKey(): string {
  return crypto.randomUUID();
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="panel-title">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

export function AdminConsole() {
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [memberId, setMemberId] = useState("");
  const [amount, setAmount] = useState("1000");
  const [reason, setReason] = useState("Manual operator adjustment");
  const [rankLevel, setRankLevel] = useState<GridTierKey | "">("");
  const [status, setStatus] = useState<GridUser["status"]>("ACTIVE");
  const [campaignAmount, setCampaignAmount] = useState("500");
  const [eventKey, setEventKey] = useState("SEASONAL_DROP");
  const [orderId, setOrderId] = useState("");
  const [orderAmount, setOrderAmount] = useState("0");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const payload = await gFetch<OverviewPayload>("/api/admin/overview");
      setData(payload);
      if (!memberId && payload.users[0]) setMemberId(payload.users[0].memberId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => { load(); }, [load]);

  const selectedUser = useMemo(
    () => data?.users.find((user) => user.memberId === memberId) ?? null,
    [data?.users, memberId],
  );

  async function mutate(path: string, body: Record<string, unknown>) {
    setError(null);
    setMessage(null);
    const key = idempotencyKey();
    await gFetch(path, {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify({ ...body, idempotencyKey: key }),
    });
    setMessage("Mutation accepted and recorded.");
    await load();
  }

  if (loading && !data) {
    return (
      <main className="relative flex min-h-screen items-center justify-center px-6">
        <HologramScene />
        <div className="panel-shell z-10 w-full max-w-sm text-center">
          <p className="panel-title">ADMIN</p>
          <h1 className="mt-3 text-2xl uppercase tracking-[0.18em] text-white">CONTROL PANEL</h1>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-4 md:px-6 md:py-6">
      <HologramScene />
      <div className="relative z-10 mx-auto flex max-w-7xl flex-col gap-6">
        <header className="panel-shell flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="panel-title">THE GRID — OWNER CONSOLE</p>
            <h1 className="glitch-text mt-2 text-3xl uppercase tracking-[0.18em] text-white md:text-5xl" data-text="ADMIN">
              ADMIN
            </h1>
            {data && <p className="mt-2 text-xs text-grid-muted">{data.admin.email} · {data.admin.roles.join(", ")}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/" className="grid-button-ghost">Member View</a>
            <button className="grid-button-ghost" onClick={load}>Refresh</button>
          </div>
        </header>

        {(error || message) && (
          <div className={`rounded-2xl border px-4 py-3 text-sm ${error ? "border-red-400/25 bg-red-500/10 text-red-100" : "border-grid-cyan/25 bg-grid-cyan/8 text-grid-cyan"}`}>
            {error ?? message}
          </div>
        )}

        {data && (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatTile label="ACTIVE USERS" value={data.globalStats.activeUsers.toLocaleString("en-IN")} />
              <StatTile label="CRED ISSUED" value={formatCompactNumber(data.globalStats.totalCredsIssued)} />
              <StatTile label="REDEEMED" value={formatCompactNumber(data.globalStats.totalCredsRedeemed)} />
              <StatTile label="SAVINGS" value={formatIndianCurrency(data.globalStats.totalSavingsRupees)} />
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="panel-shell">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="panel-title">USER MODERATION</p>
                    <h2 className="mt-2 text-xl uppercase tracking-[0.16em] text-white">Member Registry</h2>
                  </div>
                  <span className="data-chip">{data.users.length} loaded</span>
                </div>
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead className="text-[10px] uppercase tracking-[0.24em] text-grid-muted">
                      <tr>
                        <th className="pb-3">User</th>
                        <th className="pb-3">Balance</th>
                        <th className="pb-3">Tier</th>
                        <th className="pb-3">Status</th>
                        <th className="pb-3">Risk</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {data.users.map((user) => (
                        <tr
                          key={user.memberId}
                          className={`cursor-pointer transition-colors hover:bg-white/5 ${memberId === user.memberId ? "bg-grid-cyan/8" : ""}`}
                          onClick={() => setMemberId(user.memberId)}
                        >
                          <td className="py-3">
                            <p className="font-semibold text-white">{user.username}</p>
                            <p className="text-[10px] text-grid-muted">{user.email}</p>
                          </td>
                          <td className="py-3 text-white">{user.availableCreds.toLocaleString("en-IN")} C</td>
                          <td className="py-3 text-grid-cyan">{user.rankOverride ?? user.level}</td>
                          <td className="py-3 text-grid-muted">{user.status}</td>
                          <td className={`py-3 ${user.fraudHold ? "text-red-300" : "text-grid-muted"}`}>{user.fraudScore ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="panel-shell">
                <p className="panel-title">OPERATOR ACTIONS</p>
                <h2 className="mt-2 text-xl uppercase tracking-[0.16em] text-white">Controls</h2>
                <div className="mt-5 space-y-4">
                  <label className="block">
                    <span className="mb-2 block text-[10px] uppercase tracking-[0.28em] text-grid-muted">Member ID</span>
                    <input className="grid-input" value={memberId} onChange={(e) => setMemberId(e.target.value)} />
                  </label>
                  {selectedUser && (
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-xs text-grid-muted">
                      <p className="font-semibold text-white">{selectedUser.username}</p>
                      <p>{selectedUser.availableCreds.toLocaleString("en-IN")} C · {selectedUser.status}</p>
                    </div>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input className="grid-input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Cred amount" />
                    <input className="grid-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
                  </div>
                  <button className="grid-button w-full" onClick={() => mutate(`/api/admin/users/${memberId}/adjust`, { amount: Number(amount), reason })}>
                    Adjust Creds
                  </button>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <select className="grid-input" value={rankLevel} onChange={(e) => setRankLevel(e.target.value as GridTierKey | "")}>
                      <option value="">Clear Override</option>
                      <option value="THE_GLITCH">THE_GLITCH</option>
                      <option value="NETRUNNER">NETRUNNER</option>
                      <option value="SYS-ADMIN">SYS-ADMIN</option>
                      <option value="THE_ARCHITECT">THE_ARCHITECT</option>
                      <option value="THE_SINGULARITY">THE_SINGULARITY</option>
                    </select>
                    <button className="grid-button-ghost" onClick={() => mutate(`/api/admin/users/${memberId}/rank`, { level: rankLevel || null, reason })}>
                      Force Rank
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <select className="grid-input" value={status} onChange={(e) => setStatus(e.target.value as GridUser["status"])}>
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="SUSPENDED">SUSPENDED</option>
                      <option value="BANNED">BANNED</option>
                    </select>
                    <button className="grid-button-ghost" onClick={() => mutate(`/api/admin/users/${memberId}/moderation`, { status, reason })}>
                      Moderate
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-3">
              <div className="panel-shell">
                <p className="panel-title">BONUS CAMPAIGN</p>
                <div className="mt-4 space-y-3">
                  <input className="grid-input" value={campaignAmount} onChange={(e) => setCampaignAmount(e.target.value)} placeholder="Cred amount" />
                  <input className="grid-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
                  <button className="grid-button w-full" onClick={() => mutate("/api/admin/campaigns/bonus", { amount: Number(campaignAmount), reason })}>
                    Trigger Bonus
                  </button>
                </div>
              </div>

              <div className="panel-shell">
                <p className="panel-title">SEASONAL EVENT</p>
                <div className="mt-4 space-y-3">
                  <input className="grid-input" value={eventKey} onChange={(e) => setEventKey(e.target.value)} placeholder="Event key" />
                  <button className="grid-button w-full" onClick={() => mutate("/api/admin/events/seasonal", {
                    eventKey,
                    amount: Number(campaignAmount),
                    startsAt: new Date().toISOString(),
                    endsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1_000).toISOString(),
                    reason,
                  })}>
                    Create Event
                  </button>
                </div>
              </div>

              <div className="panel-shell">
                <p className="panel-title">ORDER RECONCILIATION</p>
                <div className="mt-4 space-y-3">
                  <input className="grid-input" value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="Order ID" />
                  <input className="grid-input" value={orderAmount} onChange={(e) => setOrderAmount(e.target.value)} placeholder="Order amount" />
                  <button className="grid-button w-full" onClick={() => mutate("/api/admin/reconcile", {
                    memberId,
                    orderId,
                    amount: Number(orderAmount),
                    currency: "INR",
                    reason,
                  })}>
                    Reconcile
                  </button>
                </div>
              </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-3">
              <div className="panel-shell">
                <div className="flex items-center justify-between">
                  <p className="panel-title">FRAUD DETECTION</p>
                  <span className="data-chip">{data.flaggedUsers.length}</span>
                </div>
                <div className="mt-4 space-y-3">
                  {data.flaggedUsers.map((user) => (
                    <div key={user.memberId} className="rounded-2xl border border-red-400/20 bg-red-500/10 p-3">
                      <p className="text-sm font-semibold text-white">{user.username}</p>
                      <p className="text-[10px] text-red-200">Score {user.fraudScore ?? 0}</p>
                    </div>
                  ))}
                  {data.flaggedUsers.length === 0 && <p className="text-sm text-grid-muted">No active holds.</p>}
                </div>
              </div>

              <div className="panel-shell">
                <p className="panel-title">REDEMPTIONS</p>
                <div className="mt-4 space-y-3">
                  {data.redemptions.slice(0, 8).map((item) => (
                    <div key={item.id} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <p className="font-mono text-xs text-white">{item.couponCode ?? item.id}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-[0.22em] text-grid-muted">{item.status} · {item.credsSpent} C</p>
                      {(item.status === "RECOVERABLE" || item.status === "FAILED") && (
                        <button
                          className="mt-3 grid-button-ghost w-full text-[10px]"
                          onClick={() => mutate(`/api/admin/redemptions/${item.id}/recover`, {
                            status: "CANCELLED",
                            note: "Closed from admin console",
                          })}
                        >
                          Close Recovery
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel-shell">
                <p className="panel-title">SYNC JOBS</p>
                <div className="mt-4 space-y-3">
                  {data.syncJobs.map((job) => (
                    <div key={job.id} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <p className="text-xs font-semibold text-white">{job.type}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-[0.22em] text-grid-muted">{job.status} · {fmtDate(job.startedAt)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="panel-shell">
              <div className="flex items-center justify-between">
                <p className="panel-title">AUDIT LOGS</p>
                <span className="data-chip">{data.auditLogs.length}</span>
              </div>
              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                {data.auditLogs.slice(0, 12).map((log) => (
                  <div key={log.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-white">{log.action}</p>
                      <span className="text-[10px] uppercase tracking-[0.24em] text-grid-muted">{log.severity}</span>
                    </div>
                    <p className="mt-2 text-xs text-grid-muted">{log.message}</p>
                    <p className="mt-2 text-[10px] text-grid-muted/70">{fmtDate(log.createdAt)}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
