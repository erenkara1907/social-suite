import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { STATE_FILE, type E2eUser } from "./global-setup";

/**
 * A3 — test hesabını siler. `brands.owner_id` `auth.users` üzerinde
 * `on delete cascade` (`00_schema.sql:103`), yani kullanıcıyı silmek marka
 * satırını da götürür — ikinci bir silme çağrısı gerekmiyor.
 */
export default async function globalTeardown() {
  if (!existsSync(STATE_FILE)) return;

  const { userId } = JSON.parse(readFileSync(STATE_FILE, "utf8")) as E2eUser;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && serviceKey) {
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    await admin.auth.admin.deleteUser(userId);
  }

  rmSync(STATE_FILE, { force: true });
}
