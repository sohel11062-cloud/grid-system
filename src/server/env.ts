import "server-only";
import { z } from "zod";

const serverEnvSchema = z.object({
  APP_URL: z.string().url(),
  NEXT_PUBLIC_API_BASE_URL: z.string().url().optional().or(z.literal("")),
  ALLOWED_ORIGIN: z.string().url().optional(),
  SESSION_SECRET: z.string().min(32),
  SESSION_COOKIE_NAME: z.string().default("grid_session"),
  OAUTH_COOKIE_NAME: z.string().default("grid_oauth"),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
  CRON_SECRET: z.string().min(16),
  WIX_CLIENT_ID: z.string().min(1),
  WIX_API_KEY: z.string().min(1),
  WIX_SITE_ID: z.string().min(1),
  WIX_MEMBERS_ENDPOINT: z.string().url().default("https://www.wixapis.com/members/v1/members"),
  WIX_MEMBERS_QUERY_ENDPOINT: z.string().url().default("https://www.wixapis.com/members/v1/members/query"),
  WIX_CONTACTS_ENDPOINT: z.string().url().default("https://www.wixapis.com/contacts/v4/contacts"),
  WIX_ORDERS_SEARCH_ENDPOINT: z.string().url().default("https://www.wixapis.com/ecom/v1/orders/search"),
  // Updated to ecom v1 endpoint as per Wix latest API docs
  // Fallback: https://www.wixapis.com/stores/v2/coupons (stores/v2 uses numeric moneyOffAmount inside specification wrapper)
  WIX_COUPONS_ENDPOINT: z.string().url().default("https://www.wixapis.com/ecom/v1/coupons"),
  MONGODB_URI: z.string().optional(),
  MONGODB_DB_NAME: z.string().default("the-grid"),
  GRID_CURRENCY: z.string().default("INR"),
  GRID_COUPON_SCOPE_NAMESPACE: z.string().default("stores"),
  SYNC_STALE_HOURS: z.coerce.number().default(24),
  WELCOME_BONUS_CREDITS: z.coerce.number().default(5000),
  BIRTHDAY_BONUS_CREDITS: z.coerce.number().default(5000),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | null = null;

export function getEnv(): ServerEnv {
  if (cachedEnv) return cachedEnv;

  const parsed = serverEnvSchema.safeParse({
    APP_URL: process.env.APP_URL,
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
    ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN,
    SESSION_SECRET: process.env.SESSION_SECRET,
    SESSION_COOKIE_NAME: process.env.SESSION_COOKIE_NAME,
    OAUTH_COOKIE_NAME: process.env.OAUTH_COOKIE_NAME,
    COOKIE_DOMAIN: process.env.COOKIE_DOMAIN,
    COOKIE_SAME_SITE: process.env.COOKIE_SAME_SITE,
    CRON_SECRET: process.env.CRON_SECRET,
    WIX_CLIENT_ID: process.env.WIX_CLIENT_ID,
    WIX_API_KEY: process.env.WIX_API_KEY,
    WIX_SITE_ID: process.env.WIX_SITE_ID,
    WIX_MEMBERS_ENDPOINT: process.env.WIX_MEMBERS_ENDPOINT,
    WIX_MEMBERS_QUERY_ENDPOINT: process.env.WIX_MEMBERS_QUERY_ENDPOINT,
    WIX_CONTACTS_ENDPOINT: process.env.WIX_CONTACTS_ENDPOINT,
    WIX_ORDERS_SEARCH_ENDPOINT: process.env.WIX_ORDERS_SEARCH_ENDPOINT,
    WIX_COUPONS_ENDPOINT: process.env.WIX_COUPONS_ENDPOINT,
    MONGODB_URI: process.env.MONGODB_URI,
    MONGODB_DB_NAME: process.env.MONGODB_DB_NAME,
    GRID_CURRENCY: process.env.GRID_CURRENCY,
    GRID_COUPON_SCOPE_NAMESPACE: process.env.GRID_COUPON_SCOPE_NAMESPACE,
    SYNC_STALE_HOURS: process.env.SYNC_STALE_HOURS,
    WELCOME_BONUS_CREDITS: process.env.WELCOME_BONUS_CREDITS,
    BIRTHDAY_BONUS_CREDITS: process.env.BIRTHDAY_BONUS_CREDITS,
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid server environment:\n${parsed.error.issues
        .map((i) => `- ${i.path.join(".")}: ${i.message}`)
        .join("\n")}`
    );
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}
