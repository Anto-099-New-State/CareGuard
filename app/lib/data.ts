import "server-only";
import { big, db, type EpisodeRow, type PayerRow } from "./server/db";
import type { Session } from "./server/session";
import type { DashboardData, EpisodeSummary } from "./types";

type EpisodeWithPayers = EpisodeRow & { payers: Pick<PayerRow, "role" | "display_name" | "funded_usdc">[] };

const summary = (e: EpisodeWithPayers): EpisodeSummary => ({
  id: e.id,
  contractEpisodeId: e.contract_episode_id === null ? null : BigInt(e.contract_episode_id),
  patientLabel: e.patient_label,
  description: e.description,
  status: e.status,
  payers: e.payers
    .sort((a, b) => a.role.localeCompare(b.role))
    .map((p) => ({ role: p.role, label: p.display_name, funded: big(p.funded_usdc) > 0n })),
  guarantee: big(e.guarantee_usdc),
  paidTotal: big(e.paid_total),
  covererBalance: big(e.coverer_balance),
  familyBalance: big(e.family_balance),
  expiresAt: e.expires_at ?? "",
});

/** The provider dashboard: their episodes, recent agent decisions and open margin calls. */
export async function getDashboard(s: Session): Promise<DashboardData> {
  if (!s.provider) return { providerName: null, episodes: [], decisions: [], marginCalls: [] };
  const { data: eps } = await db()
    .from("episodes")
    .select("*, payers(role, display_name, funded_usdc)")
    .eq("provider_id", s.provider.id)
    .order("created_at", { ascending: false });
  const episodes = ((eps ?? []) as EpisodeWithPayers[]).map(summary);
  const ids = episodes.map((e) => e.id);
  if (ids.length === 0) return { providerName: s.provider.name, episodes, decisions: [], marginCalls: [] };

  const [{ data: decisions }, { data: calls }] = await Promise.all([
    db().from("decisions").select("id, episode_id, kind, outcome, reason, tx_hash, created_at").in("episode_id", ids).order("created_at", { ascending: false }).limit(6),
    db()
      .from("transactions")
      .select("episode_id, amount, created_at, payers(role)")
      .eq("kind", "margin_call")
      .in("episode_id", episodes.filter((e) => e.status === "margin_call").map((e) => e.id).concat("00000000-0000-0000-0000-000000000000"))
      .order("created_at", { ascending: false }),
  ]);

  const seen = new Set<string>();
  const marginCalls = ((calls ?? []) as unknown as { episode_id: string; amount: number; payers: { role: "coverer" | "family" } | null }[])
    .filter((c) => !seen.has(c.episode_id) && seen.add(c.episode_id))
    .map((c) => {
      const ep = episodes.find((e) => e.id === c.episode_id)!;
      return { episodeId: c.episode_id, episodeLabel: `#${ep.contractEpisodeId} · ${ep.patientLabel}`, payerRole: c.payers?.role ?? "family", amount: big(c.amount), reason: "" };
    });

  return {
    providerName: s.provider.name,
    episodes,
    decisions: ((decisions ?? []) as { id: string; episode_id: string; kind: string; outcome: string; reason: string; tx_hash: string | null; created_at: string }[]).map((d) => ({
      id: d.id,
      episodeId: d.episode_id,
      kind: d.kind as DashboardData["decisions"][number]["kind"],
      outcome: d.outcome,
      reason: d.reason,
      txHash: d.tx_hash,
      createdAt: d.created_at,
    })),
    marginCalls,
  };
}

/** Episodes where the signed-in wallet is a payer (matched by account or by wallet address). */
export async function getPayerEpisodes(s: Session) {
  const wallet = s.caller.wallet.toLowerCase();
  const { data } = await db()
    .from("payers")
    .select("id, role, owed_usdc, funded_usdc, wallet_address, episodes(id, patient_label, status, contract_episode_id, guarantee_usdc, paid_total, coverer_balance, family_balance, expires_at, created_at, providers(name))")
    .or(`user_id.eq.${s.caller.userId},wallet_address.ilike.${wallet}`);
  return ((data ?? []) as unknown as PayerEpisode[]).sort((a, b) => b.episodes.created_at.localeCompare(a.episodes.created_at));
}

/** Episodes where the signed-in wallet is the patient, including ones a relative or insurer pays for. */
export async function getPatientEpisodes(s: Session) {
  const { data } = await db()
    .from("episodes")
    .select("id, patient_label, status, contract_episode_id, guarantee_usdc, paid_total, expires_at, created_at, providers(name), payers(role, display_name, wallet_address)")
    .eq("patient_wallet", s.caller.wallet.toLowerCase())
    .order("created_at", { ascending: false });
  return (data ?? []) as unknown as {
    id: string;
    patient_label: string;
    status: EpisodeRow["status"];
    contract_episode_id: number | null;
    guarantee_usdc: number | null;
    paid_total: number;
    expires_at: string | null;
    created_at: string;
    providers: { name: string };
    payers: { role: "coverer" | "family"; display_name: string; wallet_address: string | null }[];
  }[];
}

export type PayerEpisode = {
  id: string;
  role: "coverer" | "family";
  owed_usdc: number;
  funded_usdc: number;
  wallet_address: string;
  episodes: {
    id: string;
    patient_label: string;
    status: EpisodeRow["status"];
    contract_episode_id: number | null;
    guarantee_usdc: number | null;
    paid_total: number;
    coverer_balance: number;
    family_balance: number;
    expires_at: string | null;
    created_at: string;
    providers: { name: string };
  };
}
