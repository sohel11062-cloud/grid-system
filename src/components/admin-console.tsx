"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

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

import {
  formatCompactNumber,
  formatIndianCurrency,
} from "@/lib/grid";

import { AnimatedCounter } from "@/components/animated-counter";

const HologramScene = dynamic(
  () =>
    import("@/components/hologram-scene").then(
      (m) => m.HologramScene,
    ),
  {
    ssr: false,
    loading: () => null,
  },
);

/* ─────────────────────────────────────────────────────────────────────────────
   TYPES
───────────────────────────────────────────────────────────────────────────── */

interface OverviewPayload {
  admin: {
    memberId: string;
    email: string;
    roles: string[];
  };

  globalStats: GlobalStats;
  users: GridUser[];
  flaggedUsers: GridUser[];
  redemptions: RedemptionRecord[];
  auditLogs: AuditLog[];
  adminActions: AdminAction[];
  syncJobs: SyncJob[];
}

/* ─────────────────────────────────────────────────────────────────────────────
   UTILITIES
───────────────────────────────────────────────────────────────────────────── */

async function gFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {

  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body
        ? { "Content-Type": "application/json" }
        : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {

    const body = (await response
      .json()
      .catch(() => null)) as {
      error?: string;
    } | null;

    throw new Error(
      body?.error ?? `HTTP ${response.status}`,
    );
  }

  return response.json() as Promise<T>;
}

function fmtDate(value?: string | null): string {

  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function idempotencyKey(): string {
  return crypto.randomUUID();
}

/* ─────────────────────────────────────────────────────────────────────────────
   STAT TILE COMPONENT
───────────────────────────────────────────────────────────────────────────── */

function StatTile({
  label,
  value,
}: {
  label: string;
  value: number;
}) {

  return (
    <div
      className="
        relative
        overflow-hidden
        rounded-lg
        border border-grid-border-strong
        bg-grid-surface
        p-6
        transition-all
        duration-300
        hover:border-grid-gold/20
        hover:bg-grid-bg-secondary
      "
    >

      <div className="relative z-10">

        <p className="panel-title">
          {label}
        </p>

        <p className="mt-3 text-2xl md:text-3xl font-semibold text-grid-text">

          <AnimatedCounter
            value={value}
          />

        </p>

      </div>

    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────────────── */

export function AdminConsole() {

  const [data, setData] =
    useState<OverviewPayload | null>(null);

  const isOwner =
    data?.admin.roles.includes("owner") ?? false;

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [message, setMessage] =
    useState<string | null>(null);

  const [memberId, setMemberId] =
    useState("");

  const [searchQuery, setSearchQuery] =
    useState("");

  const [userFilter, setUserFilter] =
    useState<
      "ALL" |
      "ACTIVE" |
      "SUSPENDED" |
      "BANNED" |
      "FRAUD"
    >("ALL");

  const [amount, setAmount] =
    useState("1000");

  const [reason, setReason] =
    useState(
      "Manual operator adjustment",
    );

  const [campaignAmount, setCampaignAmount] =
    useState("500");

  const [eventKey, setEventKey] =
    useState("SEASONAL_DROP");

  const [campaignType, setCampaignType] =
    useState<"GLOBAL" | "TIER" | "EVENT">(
      "GLOBAL",
    );

  const [orderId, setOrderId] =
    useState("");

  const [conversionRate, setConversionRate] =
    useState("100");

  /* LOAD DATA */
  const load = useCallback(async () => {

    try {

      setLoading(true);
      setError(null);

      const payload =
        await gFetch<OverviewPayload>(
          "/api/admin/overview",
        );

      setData(payload);

      if (
        payload.users.length > 0 &&
        !payload.users.some(
          (u) => u.memberId === memberId,
        )
      ) {
        setMemberId(payload.users[0].memberId);
      }

    } catch (err) {

      setError((err as Error).message);

    } finally {

      setLoading(false);
    }

  }, [memberId]);

  useEffect(() => {
    load();
  }, [load]);

  /* FILTERED USERS */
  const filteredUsers = useMemo(() => {

    if (!data) {
      return [];
    }

    return data.users.filter((user) => {

      const q = searchQuery
        .trim()
        .toLowerCase();

      const matchesSearch =
        q.length === 0 ||
        user.username
          .toLowerCase()
          .includes(q) ||
        user.email
          .toLowerCase()
          .includes(q) ||
        user.memberId
          .toLowerCase()
          .includes(q);

      let matchesFilter = true;

      switch (userFilter) {

        case "ACTIVE":
          matchesFilter =
            user.status === "ACTIVE";
          break;

        case "SUSPENDED":
          matchesFilter =
            user.status === "SUSPENDED";
          break;

        case "BANNED":
          matchesFilter =
            user.status === "BANNED";
          break;

        case "FRAUD":
          matchesFilter =
            user.fraudHold === true;
          break;

        default:
          matchesFilter = true;
      }

      return (
        matchesSearch && matchesFilter
      );
    });

  }, [
    data,
    searchQuery,
    userFilter,
  ]);

  /* SELECTED USER */
  const selectedUser = useMemo(
    () =>
      data?.users.find(
        (user) =>
          user.memberId === memberId,
      ) ?? null,

    [data?.users, memberId],
  );

  /* MUTATION HANDLER */
  async function mutate(
    path: string,
    body: Record<string, unknown>,
  ) {

    try {

      setError(null);
      setMessage(null);

      const key = idempotencyKey();

      await gFetch(path, {
        method: "POST",
        headers: {
          "Idempotency-Key": key,
        },
        body: JSON.stringify({
          ...body,
          idempotencyKey: key,
        }),
      });

      setMessage(
        "Action executed and recorded.",
      );

      await load();

    } catch (err) {

      setError((err as Error).message);
    }
  }

  /* LOADING STATE */
  if (loading && !data) {

    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">

        <div className="hidden md:block absolute inset-0 -z-10">
          <HologramScene />
        </div>

        <div className="panel-shell relative z-10 w-full max-w-sm text-center">

          <p className="panel-title">
            ADMIN CONSOLE
          </p>

          <h1 className="mt-3 text-2xl md:text-3xl uppercase tracking-[0.18em] text-grid-text">
            LOADING CONTROL PANEL
          </h1>

        </div>

      </main>
    );
  }

  /* MAIN RENDER */
  return (
    <main className="relative min-h-screen overflow-x-hidden px-4 py-8 md:px-6 md:py-10">

      {/* BACKGROUND - DESKTOP ONLY */}
      <div className="hidden md:block absolute inset-0 -z-10">
        <HologramScene />
      </div>

      <div className="relative z-0 mx-auto flex max-w-7xl flex-col gap-8">

        {/* HEADER */}
        <header className="panel-shell flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

          <div className="flex-1">

            <p className="panel-title">
              THE GRID — OWNER CONSOLE
            </p>

            <h1 className="mt-2 text-2xl md:text-4xl uppercase tracking-[0.12em] text-grid-text">
              ADMIN
            </h1>

            {data && (
              <>

                <p className="mt-2 text-xs text-grid-muted">

                  {data.admin.email}

                  {" · "}

                  {data.admin.roles.join(", ")}

                </p>

                <div className="mt-4 flex flex-wrap gap-2">

                  <span className="data-chip">
                    GRID CORE ONLINE
                  </span>

                  <span className="data-chip">
                    LIVE LEDGER
                  </span>

                  <span className="data-chip">
                    FRAUD ENGINE ACTIVE
                  </span>

                </div>

              </>
            )}

          </div>

          <div className="flex flex-wrap gap-2">

            <a
              href="/"
              className="grid-button-ghost"
            >
              Member View
            </a>

            <button
              className="grid-button-ghost"
              onClick={load}
            >
              Refresh
            </button>

          </div>

        </header>

        {/* STATUS MESSAGES */}
        {(error || message) && (

          <div
            className={`
              rounded-lg border px-4 py-3 text-sm ${
                error
                  ? "border-grid-crimson/30 bg-grid-crimson/10 text-grid-crimson/90"
                  : "border-grid-gold/25 bg-grid-gold/8 text-grid-gold"
              }
            `}
          >

            {error ?? message}

          </div>
        )}

        {data && (
          <>

            {/* STATS GRID */}
            <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">

              <StatTile
                label="ACTIVE USERS"
                value={data.globalStats.activeUsers}
              />

              <StatTile
                label="CREDS ISSUED"
                value={
                  data.globalStats.totalCredsIssued
                }
              />

              <StatTile
                label="REDEEMED"
                value={
                  data.globalStats.totalCredsRedeemed
                }
              />

              <StatTile
                label="TOTAL SAVINGS (₹)"
                value={
                  data.globalStats.totalSavingsRupees
                }
              />

            </section>

            {/* USER MANAGEMENT */}
            <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">

              {/* USERS TABLE */}
              <div className="panel-shell overflow-hidden">

                <div className="flex flex-wrap items-center justify-between gap-3">

                  <div>

                    <p className="panel-title">
                      USER MODERATION
                    </p>

                    <h2 className="mt-2 text-lg uppercase tracking-[0.16em] text-grid-text">
                      Member Registry
                    </h2>

                  </div>

                  <span className="data-chip">
                    {filteredUsers.length} visible
                  </span>

                </div>

                <div className="mt-5 flex flex-col gap-3 md:flex-row">

                  <input
                    className="grid-input flex-1"
                    placeholder="Search username, email or member ID..."
                    value={searchQuery}
                    onChange={(e) =>
                      setSearchQuery(e.target.value)
                    }
                  />

                  <select
                    className="grid-input md:w-48"
                    value={userFilter}
                    onChange={(e) =>
                      setUserFilter(
                        e.target.value as
                          | "ALL"
                          | "ACTIVE"
                          | "SUSPENDED"
                          | "BANNED"
                          | "FRAUD",
                      )
                    }
                  >

                    <option value="ALL">
                      All Users
                    </option>

                    <option value="ACTIVE">
                      Active
                    </option>

                    <option value="SUSPENDED">
                      Suspended
                    </option>

                    <option value="BANNED">
                      Banned
                    </option>

                    <option value="FRAUD">
                      Fraud Hold
                    </option>

                  </select>

                </div>

                {/* TABLE */}
                <div className="mt-5 overflow-x-auto rounded-lg border border-grid-border bg-grid-surface">

                  <table className="w-full min-w-[760px] text-left text-xs">

                    <thead className="text-[10px] uppercase tracking-[0.24em] text-grid-muted border-b border-grid-border">

                      <tr>

                        <th className="pb-3 px-4 pt-4">
                          User
                        </th>

                        <th className="pb-3 px-4">
                          Balance
                        </th>

                        <th className="pb-3 px-4">
                          Tier
                        </th>

                        <th className="pb-3 px-4">
                          Status
                        </th>

                        <th className="pb-3 px-4">
                          Risk
                        </th>

                      </tr>

                    </thead>

                    <tbody className="divide-y divide-grid-border">

                      {filteredUsers.map(
                        (user) => (

                          <tr
                            key={user.memberId}
                            className={`
                              cursor-pointer
                              transition-all
                              duration-200
                              hover:bg-grid-bg-secondary
                              ${
                                memberId ===
                                user.memberId
                                  ? "bg-grid-gold/8"
                                  : ""
                              }
                            `}
                            onClick={() =>
                              setMemberId(
                                user.memberId,
                              )
                            }
                          >

                            <td className="py-4 px-4">

                              <p className="font-semibold text-grid-text">
                                {user.username}
                              </p>

                              <p className="text-[10px] text-grid-muted">
                                {user.email}
                              </p>

                            </td>

                            <td className="py-4 px-4 text-grid-text">

                              {user.availableCreds.toLocaleString(
                                "en-IN",
                              )}{" "}
                              C

                            </td>

                            <td className="py-4 px-4 text-grid-gold">

                              {user.rankOverride ??
                                user.level}

                            </td>

                            <td className="py-4 px-4 text-grid-muted">

                              {user.status}

                            </td>

                            <td className="py-4 px-4">

                              <span
                                className={
                                  (user.fraudScore ??
                                    0) > 70
                                    ? "text-grid-crimson font-semibold"
                                    : (user.fraudScore ??
                                        0) > 40
                                      ? "text-amber-600"
                                      : "text-grid-green"
                                }
                              >
                                {user.fraudScore ?? 0}
                              </span>

                            </td>

                          </tr>
                        ),
                      )}

                    </tbody>

                  </table>

                </div>

              </div>

              {/* OPERATOR PANEL */}
              <div className="panel-shell">

                <p className="panel-title">
                  OPERATOR ACTIONS
                </p>

                <h2 className="mt-2 text-lg uppercase tracking-[0.16em] text-grid-text">
                  Controls
                </h2>

                <div className="mt-6 space-y-4">

                  <label className="block">

                    <span className="mb-2 block text-[10px] uppercase tracking-[0.28em] text-grid-muted">
                      Member ID
                    </span>

                    <input
                      className="grid-input"
                      value={memberId}
                      onChange={(e) =>
                        setMemberId(e.target.value)
                      }
                    />

                  </label>

                  {selectedUser && (

                    <div className="rounded-lg border border-grid-border bg-grid-surface p-4 text-xs text-grid-muted">

                      <p className="font-semibold text-grid-text">
                        {selectedUser.username}
                      </p>

                      <p>

                        {selectedUser.availableCreds.toLocaleString(
                          "en-IN",
                        )}{" "}
                        C ·{" "}
                        {selectedUser.status}

                      </p>

                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">

                    <input
                      className="grid-input"
                      value={amount}
                      onChange={(e) =>
                        setAmount(e.target.value)
                      }
                      placeholder="Cred amount"
                      inputMode="numeric"
                    />

                    <input
                      className="grid-input"
                      value={reason}
                      onChange={(e) =>
                        setReason(e.target.value)
                      }
                      placeholder="Reason"
                    />

                  </div>

                  <button
                    className="grid-button w-full"
                    onClick={() =>
                      mutate(
                        `/api/admin/users/${memberId}/adjust`,
                        {
                          amount:
                            Number(amount),
                          reason,
                        },
                      )
                    }
                  >

                    Adjust Creds

                  </button>

                </div>

              </div>

            </section>

            {/* CAMPAIGN ENGINE */}
            <section className="panel-shell">

              <div className="flex items-center justify-between">

                <div>

                  <p className="panel-title">
                    CAMPAIGN ENGINE
                  </p>

                  <h2 className="mt-2 text-lg uppercase tracking-[0.16em] text-grid-text">
                    Bonus Distribution
                  </h2>

                </div>

                <span className="data-chip">
                  LIVE
                </span>

              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">

                <input
                  className="grid-input"
                  placeholder="Campaign amount"
                  value={campaignAmount}
                  onChange={(e) =>
                    setCampaignAmount(
                      e.target.value,
                    )
                  }
                  inputMode="numeric"
                />

                <select
                  className="grid-input"
                  value={campaignType}
                  onChange={(e) =>
                    setCampaignType(
                      e.target.value as
                        | "GLOBAL"
                        | "TIER"
                        | "EVENT",
                    )
                  }
                >

                  <option value="GLOBAL">
                    GLOBAL
                  </option>

                  <option value="TIER">
                    TIER
                  </option>

                  <option value="EVENT">
                    EVENT
                  </option>

                </select>

                <input
                  className="grid-input md:col-span-2"
                  placeholder="Event Key / Campaign Reason"
                  value={eventKey}
                  onChange={(e) =>
                    setEventKey(e.target.value)
                  }
                />

              </div>

              <button
                className="grid-button w-full mt-5"
                onClick={() =>
                  mutate(
                    "/api/admin/campaigns/bonus",
                    {
                      amount:
                        Number(campaignAmount),
                      reason: eventKey,
                      campaignType,
                    },
                  )
                }
              >

                Launch Campaign

              </button>

            </section>

            {/* ECONOMY CONTROL */}
            {isOwner && (

              <section className="panel-shell">

                <div className="flex items-center justify-between">

                  <div>

                    <p className="panel-title">
                      ECONOMY CONTROL
                    </p>

                    <h2 className="mt-2 text-lg uppercase tracking-[0.16em] text-grid-text">
                      Cred Conversion Engine
                    </h2>

                  </div>

                  <span className="data-chip">
                    OWNER ONLY
                  </span>

                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">

                  <div>

                    <p className="mb-2 text-[10px] uppercase tracking-[0.28em] text-grid-muted">
                      Creds Required For ₹1
                    </p>

                    <input
                      className="grid-input"
                      value={conversionRate}
                      onChange={(e) =>
                        setConversionRate(
                          e.target.value,
                        )
                      }
                      placeholder="100"
                      inputMode="numeric"
                    />

                  </div>

                  <div className="rounded-lg border border-grid-border bg-grid-surface p-4">

                    <p className="text-[10px] uppercase tracking-[0.24em] text-grid-muted">
                      Preview
                    </p>

                    <p className="mt-3 text-lg text-grid-text">
                      {conversionRate} Creds = ₹1
                    </p>

                  </div>

                </div>

                <button
                  className="grid-button w-full mt-5"
                  onClick={() =>
                    mutate(
                      "/api/admin/economy",
                      {
                        conversionRate:
                          Number(conversionRate),
                      },
                    )
                  }
                >
                  Update Economy
                </button>

              </section>

            )}

            {/* AUDIT LOG */}
            <section className="panel-shell">

              <div className="flex items-center justify-between">

                <div>

                  <p className="panel-title">
                    LIVE SYSTEM FEED
                  </p>

                  <h2 className="mt-2 text-lg uppercase tracking-[0.16em] text-grid-text">
                    Runtime Activity
                  </h2>

                </div>

                <span className="data-chip">
                  LIVE
                </span>

              </div>

              <div className="mt-6 space-y-3">

                {data.auditLogs
                  .slice(0, 8)
                  .map((log) => (

                    <div
                      key={log.id}
                      className="
                        flex
                        items-center
                        justify-between
                        rounded-lg
                        border
                        border-grid-border
                        bg-grid-surface
                        px-4
                        py-3
                        transition-all
                        hover:border-grid-gold/20
                      "
                    >

                      <div>

                        <p className="text-sm text-grid-text font-medium">
                          {log.action}
                        </p>

                        <p className="mt-1 text-[11px] text-grid-muted">
                          {log.message}
                        </p>

                      </div>

                      <span className="text-[10px] uppercase tracking-[0.24em] text-grid-gold font-medium">
                        {log.severity}
                      </span>

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