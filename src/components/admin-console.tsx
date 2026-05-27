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

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function gFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {

  const response =
    await fetch(path, {
      ...init,

      credentials:
        "include",

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

  if (!response.ok) {

    const body =
      await response
        .json()
        .catch(() => null) as {
        error?: string;
      } | null;

    throw new Error(
      body?.error ??
      `HTTP ${response.status}`,
    );
  }

  return response.json() as Promise<T>;
}

function fmtDate(
  value?: string | null,
): string {

  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-IN",
    {
      dateStyle:
        "medium",

      timeStyle:
        "short",
    },
  ).format(
    new Date(value),
  );
}

function idempotencyKey(): string {
  return crypto.randomUUID();
}

// ─────────────────────────────────────────────────────────────────────────────
// UI
// ─────────────────────────────────────────────────────────────────────────────

function StatTile({
  label,
  value,
}: {
  label: string;
  value: string;
}) {

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">

      <p className="panel-title">
        {label}
      </p>

      <p className="mt-3 text-2xl font-semibold text-white">
        {value}
      </p>

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function AdminConsole() {

  // ───────────────────────────────────────────────────────────────────────────
  // STATE
  // ───────────────────────────────────────────────────────────────────────────

  const [data, setData] =
    useState<OverviewPayload | null>(
      null,
    );

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

  const [rankLevel, setRankLevel] =
    useState<
      GridTierKey | ""
    >("");

  const [status, setStatus] =
    useState<
      GridUser["status"]
    >("ACTIVE");

  const [campaignAmount, setCampaignAmount] =
    useState("500");

  const [eventKey, setEventKey] =
    useState("SEASONAL_DROP");

  const [campaignTarget, setCampaignTarget] =
    useState("ALL_USERS");

  const [orderId, setOrderId] =
    useState("");

  const [orderAmount, setOrderAmount] =
    useState("0");

  // ───────────────────────────────────────────────────────────────────────────
  // LOAD
  // ───────────────────────────────────────────────────────────────────────────

  const load =
    useCallback(async () => {

      try {

        setLoading(true);

        setError(null);

        const payload =
          await gFetch<OverviewPayload>(
            "/api/admin/overview",
          );

        setData(payload);

        if (
          !memberId &&
          payload.users[0]
        ) {

          setMemberId(
            payload.users[0].memberId,
          );
        }

      } catch (err) {

        setError(
          (err as Error).message,
        );

      } finally {

        setLoading(false);
      }

    }, [memberId]);

  useEffect(() => {
    load();
  }, [load]);

  // ───────────────────────────────────────────────────────────────────────────
  // FILTERED USERS
  // ───────────────────────────────────────────────────────────────────────────

  const filteredUsers =
    useMemo(() => {

      if (!data) {
        return [];
      }

      return data.users.filter(
        (user) => {

          const q =
            searchQuery
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

          let matchesFilter =
            true;

          switch (
            userFilter
          ) {

            case "ACTIVE":
              matchesFilter =
                user.status ===
                "ACTIVE";
              break;

            case "SUSPENDED":
              matchesFilter =
                user.status ===
                "SUSPENDED";
              break;

            case "BANNED":
              matchesFilter =
                user.status ===
                "BANNED";
              break;

            case "FRAUD":
              matchesFilter =
                user.fraudHold ===
                true;
              break;

            default:
              matchesFilter =
                true;
          }

          return (
            matchesSearch &&
            matchesFilter
          );
        },
      );

    }, [
      data,
      searchQuery,
      userFilter,
    ]);

  // ───────────────────────────────────────────────────────────────────────────
  // SELECTED USER
  // ───────────────────────────────────────────────────────────────────────────

  const selectedUser =
    useMemo(
      () =>
        data?.users.find(
          (user) =>
            user.memberId ===
            memberId,
        ) ?? null,

      [data?.users, memberId],
    );

  // ───────────────────────────────────────────────────────────────────────────
  // MUTATION
  // ───────────────────────────────────────────────────────────────────────────

  async function mutate(
    path: string,
    body: Record<
      string,
      unknown
    >,
  ) {

    try {

      setError(null);

      setMessage(null);

      const key =
        idempotencyKey();

      await gFetch(
        path,
        {
          method:
            "POST",

          headers: {
            "Idempotency-Key":
              key,
          },

          body:
            JSON.stringify({
              ...body,
              idempotencyKey:
                key,
            }),
        },
      );

      setMessage(
        "Mutation accepted and recorded.",
      );

      await load();

    } catch (err) {

      setError(
        (err as Error).message,
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // LOADING
  // ───────────────────────────────────────────────────────────────────────────

  if (
    loading &&
    !data
  ) {

    return (
      <main className="relative flex min-h-screen items-center justify-center px-6">

        <HologramScene />

        <div className="panel-shell z-10 w-full max-w-sm text-center">

          <p className="panel-title">
            ADMIN
          </p>

          <h1 className="mt-3 text-2xl uppercase tracking-[0.18em] text-white">
            CONTROL PANEL
          </h1>

        </div>

      </main>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // RENDER
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <main className="relative min-h-screen overflow-x-hidden overflow-y-auto px-4 py-4 md:px-6 md:py-6">

      <HologramScene />

      <div className="relative z-10 mx-auto flex max-w-7xl flex-col gap-6">

        {/* HEADER */}

        <header className="panel-shell flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

          <div>

            <p className="panel-title">
              THE GRID — OWNER CONSOLE
            </p>

            <h1 className="glitch-text mt-2 break-words text-2xl uppercase tracking-[0.12em] text-white sm:text-3xl md:text-5xl">
              ADMIN
            </h1>

            {data && (
              <p className="mt-2 text-xs text-grid-muted">

                {data.admin.email}

                {" · "}

                {data.admin.roles.join(", ")}

              </p>
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

        {/* ALERTS */}

        {(error || message) && (

          <div
            className={`rounded-2xl border px-4 py-3 text-sm ${
              error
                ? "border-red-400/25 bg-red-500/10 text-red-100"
                : "border-grid-cyan/25 bg-grid-cyan/8 text-grid-cyan"
            }`}
          >

            {error ?? message}

          </div>
        )}

        {data && (
          <>

            {/* STATS */}

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">

              <StatTile
                label="ACTIVE USERS"
                value={data.globalStats.activeUsers.toLocaleString("en-IN")}
              />

              <StatTile
                label="CRED ISSUED"
                value={formatCompactNumber(
                  data.globalStats.totalCredsIssued,
                )}
              />

              <StatTile
                label="REDEEMED"
                value={formatCompactNumber(
                  data.globalStats.totalCredsRedeemed,
                )}
              />

              <StatTile
                label="SAVINGS"
                value={formatIndianCurrency(
                  data.globalStats.totalSavingsRupees,
                )}
              />

            </section>

            {/* USER REGISTRY */}

            <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">

              <div className="panel-shell overflow-hidden">

                <div className="flex flex-wrap items-center justify-between gap-3">

                  <div>

                    <p className="panel-title">
                      USER MODERATION
                    </p>

                    <h2 className="mt-2 text-xl uppercase tracking-[0.16em] text-white">
                      Member Registry
                    </h2>

                  </div>

                  <span className="data-chip">
                    {filteredUsers.length} visible
                  </span>

                </div>

                {/* SEARCH */}

                <div className="mt-5 flex flex-col gap-3 md:flex-row">

                  <input
                    className="grid-input"
                    placeholder="Search username, email or member ID..."
                    value={searchQuery}
                    onChange={(e) =>
                      setSearchQuery(
                        e.target.value,
                      )
                    }
                  />

                  <select
                    className="grid-input md:max-w-[220px]"
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

                <div className="mt-5 overflow-x-auto">

                  <table className="w-full min-w-[760px] text-left text-xs">

                    <thead className="text-[10px] uppercase tracking-[0.24em] text-grid-muted">

                      <tr>

                        <th className="pb-3">
                          User
                        </th>

                        <th className="pb-3">
                          Balance
                        </th>

                        <th className="pb-3">
                          Tier
                        </th>

                        <th className="pb-3">
                          Status
                        </th>

                        <th className="pb-3">
                          Risk
                        </th>

                      </tr>

                    </thead>

                    <tbody className="divide-y divide-white/10">

                      {filteredUsers.map(
                        (user) => (

                          <tr
                            key={user.memberId}
                            className={`cursor-pointer transition-colors hover:bg-white/5 ${
                              memberId ===
                              user.memberId
                                ? "bg-grid-cyan/8"
                                : ""
                            }`}
                            onClick={() =>
                              setMemberId(
                                user.memberId,
                              )
                            }
                          >

                            <td className="py-3">

                              <p className="font-semibold text-white">
                                {user.username}
                              </p>

                              <p className="text-[10px] text-grid-muted">
                                {user.email}
                              </p>

                            </td>

                            <td className="py-3 text-white">

                              {user.availableCreds.toLocaleString(
                                "en-IN",
                              )}{" "}
                              C

                            </td>

                            <td className="py-3 text-grid-cyan">

                              {user.rankOverride ??
                                user.level}

                            </td>

                            <td className="py-3 text-grid-muted">

                              {user.status}

                            </td>

                            <td
                              className={`py-3 ${
                                user.fraudHold
                                  ? "text-red-300"
                                  : "text-grid-muted"
                              }`}
                            >

                              {user.fraudScore ??
                                0}

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

                <h2 className="mt-2 text-xl uppercase tracking-[0.16em] text-white">
                  Controls
                </h2>

                <div className="mt-5 space-y-4">

                  <label className="block">

                    <span className="mb-2 block text-[10px] uppercase tracking-[0.28em] text-grid-muted">
                      Member ID
                    </span>

                    <input
                      className="grid-input"
                      value={memberId}
                      onChange={(e) =>
                        setMemberId(
                          e.target.value,
                        )
                      }
                    />

                  </label>

                  {selectedUser && (

                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-xs text-grid-muted">

                      <p className="font-semibold text-white">
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
                        setAmount(
                          e.target.value,
                        )
                      }
                      placeholder="Cred amount"
                    />

                    <input
                      className="grid-input"
                      value={reason}
                      onChange={(e) =>
                        setReason(
                          e.target.value,
                        )
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

          </>
        )}

      </div>

    </main>
  );
}