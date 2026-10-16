import { AppSidebar } from "@/components/AppSidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  const name = s?.provider?.name ?? s?.caller.email ?? null;
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="flex min-h-screen flex-wrap">
      <AppSidebar provider={!!s?.provider} approver={!!s?.approver} />
      <div className="box-border flex min-w-0 flex-[999_1_560px] flex-col gap-7 px-[clamp(16px,3vw,48px)] py-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-[22px]">
          <span className="text-sm font-semibold">Today: {today}</span>
          <div className="flex flex-wrap items-center gap-[18px] text-sm">
            <ThemeToggle />
            <span className="h-6 w-px bg-line" aria-hidden="true" />
            {name ? (
              <>
                <span className="flex items-center gap-2.5 font-semibold">
                  <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-strong text-[13px] font-bold text-white">
                    {name.slice(0, 2).toUpperCase()}
                  </span>
                  {s?.provider ? `Welcome back, ${s.provider.name}` : name}
                </span>
                <form action="/auth/signout" method="post">
                  <button type="submit" className="hover-link min-h-11 cursor-pointer border-0 bg-transparent text-sm font-semibold text-muted">Sign out</button>
                </form>
              </>
            ) : (
              <a href="/signin" className="hover-link font-semibold">Sign in</a>
            )}
          </div>
        </header>
        <main id="main" className="flex min-w-0 flex-col gap-7">{children}</main>
      </div>
    </div>
  );
}
