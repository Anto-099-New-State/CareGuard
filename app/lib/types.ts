// Mirrors the contract's Status enum plus the "Funded" stage the UI shows before the first charge.
export type EpisodeStatus = "created" | "funded" | "active" | "margin_call" | "closed" | "expired";

export type PayerRole = "coverer" | "family";

export type EpisodeSummary = {
  id: string;
  contractEpisodeId: bigint | null;
  patientLabel: string;
  description: string;
  status: EpisodeStatus;
  payers: { role: PayerRole; label: string; funded: boolean }[];
  guarantee: bigint;
  paidTotal: bigint;
  covererBalance: bigint;
  familyBalance: bigint;
  expiresAt: string;
};

export type DecisionKind = "size" | "review" | "escalate" | "margin_call" | "discharge";

export type Decision = {
  id: string;
  episodeId: string;
  kind: DecisionKind;
  outcome: string;
  reason: string;
  txHash: string | null;
  createdAt: string;
};

export type MarginCall = {
  episodeId: string;
  episodeLabel: string;
  payerRole: PayerRole;
  amount: bigint;
  reason: string;
};

export type DashboardData = {
  providerName: string | null;
  episodes: EpisodeSummary[];
  decisions: Decision[];
  marginCalls: MarginCall[];
};
