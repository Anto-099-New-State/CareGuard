/** Local only: prints an access token for an e2e test user, for curl-testing pages and routes. */
import { createClient } from "@supabase/supabase-js";
import { config } from "../lib/config";

if (config.network !== "local") throw new Error("dev-token is for the local network only.");
const email = process.argv[2] ?? "provider@e2e.local";
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
anon.auth.signInWithPassword({ email, password: "local-e2e-password" }).then(({ data, error }) => {
  if (error) throw error;
  process.stdout.write(data.session.access_token);
});
