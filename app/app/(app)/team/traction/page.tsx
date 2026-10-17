import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, Stat } from "@/components/ui/Bits";
import { PageHeader } from "@/components/ui/PageHeader";
import { traction } from "@/lib/server/episodes";
import { requireSession } from "@/lib/server/session";

export const metadata: Metadata = { title: "Traction · CareGuard" };

/** Numbers for the submission form: real providers and payers only, internal tests excluded. */
export default async function Traction() {
  const s = await requireSession("/team/traction");
  if (!s.approver) redirect("/dashboard");
  const t = await traction();

  return (
    <>
      <PageHeader title="Traction" subtitle="Real providers and payers only. Episodes marked as internal tests are excluded, and each network is counted separately." />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] gap-5">
        {(["mainnet", "testnet"] as const).map((n) => (
          <Card key={n} title={n === "mainnet" ? "Arc Mainnet (real USDC)" : "Arc Testnet"}>
            <div className="grid grid-cols-2 gap-5">
              <Stat label="Providers">{t[n].providers}</Stat>
              <Stat label="Episodes">{t[n].episodes}</Stat>
              <Stat label="Payers">{t[n].payers}</Stat>
              <Stat label="Charges paid">{t[n].chargesPaid}</Stat>
              <Stat label="Paid to providers"><span className="amount">{t[n].paidVolumeUsdc}<span className="ccy">USDC</span></span></Stat>
              <Stat label="Funded by payers"><span className="amount">{t[n].fundedVolumeUsdc}<span className="ccy">USDC</span></span></Stat>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
