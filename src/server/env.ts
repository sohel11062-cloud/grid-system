import "server-only";
import { z } from "zod";

const schema = z.object({
  APP_URL:                    z.string().url(),
  NEXT_PUBLIC_API_BASE_URL:   z.string().url().optional().or(z.literal("")),
  ALLOWED_ORIGIN:             z.string().url().optional(),
  SESSION_SECRET:             z.string().min(32),
  SESSION_COOKIE_NAME:        z.string().default("grid_session"),
  OAUTH_COOKIE_NAME:          z.string().default("grid_oauth"),
  COOKIE_DOMAIN:              z.string().optional(),
  COOKIE_SAME_SITE:           z.enum(["lax", "strict", "none"]).default("lax"),
  CRON_SECRET:                z.string().min(16),
  WIX_CLIENT_ID:              z.string().min(1),
  WIX_API_KEY:                z.string().min(1),
  WIX_SITE_ID:                z.string().min(1),
  WIX_MEMBERS_ENDPOINT:       z.string().url().default("https://www.wixapis.com/members/v1/members"),
  WIX_MEMBERS_QUERY_ENDPOINT: z.string().url().default("https://www.wixapis.com/members/v1/members/query"),
  WIX_CONTACTS_ENDPOINT:      z.string().url().default("https://www.wixapis.com/contacts/v4/contacts"),
  WIX_ORDERS_SEARCH_ENDPOINT: z.string().url().default("https://www.wixapis.com/ecom/v1/orders/search"),
  // Correct endpoint per Wix Stores v2 API docs
  WIX_COUPONS_ENDPOINT:       z.string().url().default("https://www.wixapis.com/stores/v2/coupons"),
  MONGODB_URI:                z.string().optional(),
  MONGODB_DB_NAME:            z.string().default("the-grid"),
  GRID_CURRENCY:              z.string().default("INR"),
  GRID_COUPON_SCOPE_NAMESPACE:z.string().default("stores"),
  SYNC_STALE_HOURS:           z.coerce.number().default(24),
  WELCOME_BONUS_CREDITS:      z.coerce.number().default(5000),
  BIRTHDAY_BONUS_CREDITS:     z.coerce.number().default(5000),
});

export type ServerEnv = z.infer<typeof schema>;

let _env: ServerEnv | null = null;

export function getEnv(): ServerEnv {
  if (_env) return _env;

  const result = schema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`[THE_GRID] Invalid environment configuration:\n${issues}`);
  }

  _env = result.data;
  return _env;
}