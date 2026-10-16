import Link from "next/link";
import { ShieldPlusIcon } from "./icons";

export function Logo({ href = "/", dot = true, size = "lg" }: { href?: string; dot?: boolean; size?: "lg" | "md" }) {
  const lg = size === "lg";
  return (
    <Link href={href} className={`flex items-center gap-2.5 font-display font-extrabold tracking-[-0.02em] ${lg ? "text-2xl" : "text-[22px]"}`}>
      <span className={`flex items-center justify-center bg-accent ${lg ? "h-8 w-8 rounded-[10px]" : "h-[30px] w-[30px] rounded-[9px]"}`}>
        <ShieldPlusIcon size={lg ? 18 : 16} strokeWidth={lg ? 2.2 : 2.4} stroke="#16112E" />
      </span>
      CareGuard
      {dot && <span className="-ml-2.5 text-accent">.</span>}
    </Link>
  );
}
