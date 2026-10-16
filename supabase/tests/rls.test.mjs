import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Runs every migration in PGlite (Postgres in WASM) with a stub auth schema, then checks RLS.
const dir = fileURLToPath(new URL("../migrations/", import.meta.url));

const db = new PGlite();
// Minimal stand-in for Supabase's auth schema and roles.
await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
`);
try { for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(join(dir, f), "utf8")); } catch (e) { console.log("MIGRATION ERROR:", e.message, e.position ?? ""); process.exit(2); }
await db.exec(`grant usage on schema public to authenticated; grant select on all tables in schema public to authenticated;`);

const u = { prov: "00000000-0000-0000-0000-000000000001", prov2: "00000000-0000-0000-0000-000000000002", fam: "00000000-0000-0000-0000-000000000003", appr: "00000000-0000-0000-0000-000000000004", nobody: "00000000-0000-0000-0000-000000000005" };
await db.exec(`
  insert into auth.users values ('${u.prov}'),('${u.prov2}'),('${u.fam}'),('${u.appr}'),('${u.nobody}');
  insert into providers (id, user_id, name) values ('10000000-0000-0000-0000-000000000001','${u.prov}','City Dental'),('10000000-0000-0000-0000-000000000002','${u.prov2}','Other Clinic');
  insert into approvers values ('${u.appr}', '0xabc');
  insert into price_items (id, provider_id, code, label, unit_price_usdc) values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','IMP-01','Implant surgery',300000000);
  insert into episodes (id, provider_id, network, patient_label, description, quote_usdc, contingency_pct) values
    ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','testnet','Maria L.','implant + crown',1500000000,20),
    ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','testnet','Other P.','x',100,0);
  insert into payers (episode_id, user_id, email, display_name, role) values ('30000000-0000-0000-0000-000000000001','${u.fam}','fam@x.com','Ana','family');
  insert into charges (episode_id, number, price_item_id, description, amount_usdc, covered_usdc, salt, hash) values ('30000000-0000-0000-0000-000000000001',1,'20000000-0000-0000-0000-000000000001','SECRET medical detail',300000000,220000000,'s','0x01');
  insert into decisions (episode_id, kind, inputs, outcome, reason, salt, hash) values ('30000000-0000-0000-0000-000000000001','review','{"description":"SECRET"}','pay','On price list.','s','0x02');
`);

async function as(user, sql) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user}', false); set role authenticated;`);
  const r = await db.query(sql);
  await db.exec(`reset role;`);
  return r.rows;
}
let fails = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}`); if (!ok) fails++; };

check("provider sees only own episode", (await as(u.prov, "select id from episodes")).length === 1);
check("provider sees charge description", (await as(u.prov, "select description from charges"))[0]?.description.includes("SECRET"));
check("other provider sees no charges", (await as(u.prov2, "select * from charges")).length === 0);
check("payer sees their episode", (await as(u.fam, "select id from episodes")).length === 1);
check("payer cannot read charges table", (await as(u.fam, "select * from charges")).length === 0);
const pc = await as(u.fam, "select * from payer_charges");
check("payer sees charge via view, with category", pc.length === 1 && pc[0].category === "Implant surgery");
check("payer view has no description", !("description" in pc[0]));
check("payer cannot read decision inputs", (await as(u.fam, "select * from decisions")).length === 0);
const pd = await as(u.fam, "select * from payer_decisions");
check("payer sees decision reason without inputs", pd.length === 1 && !("inputs" in pd[0]));
check("approver sees all charges", (await as(u.appr, "select * from charges")).length === 1);
check("stranger sees nothing", (await as(u.nobody, "select * from episodes")).length === 0 && (await as(u.nobody, "select * from payer_charges")).length === 0);
check("stranger cannot read indexer state", (await as(u.nobody, "select * from chain_events")).length === 0);
let writeBlocked = false;
try { await as(u.prov, "update episodes set paid_total = 1"); } catch { writeBlocked = true; }
const after = await db.query("select paid_total from episodes where paid_total = 1");
check("signed-in users cannot write", writeBlocked || after.rows.length === 0);
process.exit(fails ? 1 : 0);
