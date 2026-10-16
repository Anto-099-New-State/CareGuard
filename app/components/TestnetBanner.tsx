import { config } from "@/lib/config";

export function TestnetBanner() {
  if (!config.isTestnet) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-testnet-bg px-4 py-2 text-center text-[13px] font-semibold text-testnet">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3" />
      </svg>
      Arc Testnet: no real money
    </div>
  );
}
