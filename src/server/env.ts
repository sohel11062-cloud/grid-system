import "server-only";
import { z } from "zod";

const envSchema = z.object({
  APP_URL:        z.string().url("APP_URL must be a valid URL"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be >= 32 chars"),
  CRON_SECRET:    z.string().min(16, "CRON_SECRET must be >= 16 chars"),

  WIX_CLIENT_ID: z.string().min(1, "WIX_CLIENT_ID is required"),
  WIX_API_KEY:   z.string().min(1, "WIX_API_KEY is required"),
  WIX_SITE_ID:   z.string().min(1, "WIX_SITE_ID is required"),

  WIX_COUPONS_ENDPOINT: z
    .string().url()
    .default("https://www.wixapis.com/stores/v2/coupons"),
  WIX_MEMBERS_ENDPOINT: z
    .string().url()
    .default("https://www.wixapis.com/members/v1/members"),
  WIX_MEMBERS_QUERY_ENDPOINT: z
    .string().url()
    .default("https://www.wixapis.com/members/v1/members/query"),
  WIX_CONTACTS_ENDPOINT: z
    .string().url()
    .default("https://www.wixapis.com/contacts/v4/contacts"),
  WIX_ORDERS_SEARCH_ENDPOINT: z
    .string().url()
    .default("https://www.wixapis.com/ecom/v1/orders/search"),

  MONGODB_URI:     z.string().optional(),
  MONGODB_DB_NAME: z.string().default("the_grid"),

  SESSION_COOKIE_NAME: z.string().default("grid_session"),
  OAUTH_COOKIE_NAME:   z.string().default("grid_oauth"),
  COOKIE_SAME_SITE:    z.enum(["lax", "strict", "none"]).default("lax"),
  COOKIE_DOMAIN:       z.string().optional(),
  ALLOWED_ORIGIN:      z.string().optional(),

  WELCOME_BONUS_CREDITS:  z.coerce.number().int().positive().default(5000),
  BIRTHDAY_BONUS_CREDITS: z.coerce.number().int().positive().default(5000),
  SYNC_STALE_HOURS:       z.coerce.number().positive().default(24),
  GRID_COUPON_SCOPE_NAMESPACE: z.string().default("stores"),
  LEADERBOARD_CACHE_TTL_MS: z.coerce.number().int().positive().default(300_000),
});

export type GridEnv = z.infer<typeof envSchema>;

declare global {
  // eslint-disable-next-line no-var
  var __GRID_ENV_CACHE__: GridEnv | undefined;
}

export function getEnv(): GridEnv {
  if (global.__GRID_ENV_CACHE__) return global.__GRID_ENV_CACHE__;

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const lines = parsed.error.issues.map(
      (i) => `  • ${i.path.join(".")}: ${i.message}`
    );
    throw new Error(
      [
        "",
        "╔══════════════════════════════════════════════════════════════╗",
        "║        THE GRID — BOOT FAILURE: ENV VALIDATION FAILED        ║",
        "╚══════════════════════════════════════════════════════════════╝",
        "",
        "Required environment variables are missing or invalid:",
        ...lines,
        "",
        "Set these in .env.local or Vercel Environment Variables.",
        "",
      ].join("\n")
    );
  }

  global.__GRID_ENV_CACHE__ = parsed.data;
  return parsed.data;
}
