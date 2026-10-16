import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dark";

const styles: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink border-transparent",
  secondary: "bg-transparent text-ink border-line",
  ghost: "bg-transparent text-ink border-transparent",
  danger: "bg-transparent text-warn border-warn",
  dark: "bg-inv text-inv-ink border-transparent",
};

const base =
  "btn inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border px-5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:transform-none";

export function Button({ variant = "primary", className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" className={`${base} ${styles[variant]} ${className}`} {...rest} />;
}

export function ButtonLink({ href, variant = "primary", className = "", children }: { href: string; variant?: Variant; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={`${base} ${styles[variant]} ${className}`}>
      {children}
    </Link>
  );
}
