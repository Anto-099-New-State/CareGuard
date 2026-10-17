import { AppSidebar, type ShellUser } from "@/components/AppSidebar";
import { agentSigner } from "@/lib/server/chain";
import { getSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

function agentAddress(): string | null {
  try {
    return agentSigner().address;
  } catch {
    return null; // AGENT_ADDRESS not configured yet
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  const name = s?.provider?.name ?? s?.caller.email ?? null;
  const user: ShellUser = name ? { name, email: s?.caller.email ?? null, initials: name.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?" } : null;

  return (
    <div className="min-h-screen md:flex">
      <AppSidebar provider={!!s?.provider} approver={!!s?.approver} agent={agentAddress()} user={user} />
      <main id="main" className="mx-auto flex w-full max-w-[1240px] min-w-0 flex-1 flex-col gap-8 px-4 pt-6 pb-16 sm:px-6 md:px-10 md:pt-10">
        {children}
      </main>
    </div>
  );
}
