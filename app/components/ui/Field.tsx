import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

const control = "min-h-11 rounded-[10px] border border-line bg-card px-3.5 text-sm text-ink placeholder:text-muted";

export function Field({ label, hint, className = "", ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-[13px] font-semibold">{label}</label>
      <input id={id} className={control} aria-describedby={hint ? `${id}-hint` : undefined} {...rest} />
      {hint && <span id={`${id}-hint`} className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

export function Select({ label, className = "", children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const id = useId();
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-[13px] font-semibold">{label}</label>
      <select id={id} className={control} {...rest}>{children}</select>
    </div>
  );
}

/** Amount input: digits and a decimal point, shown with its currency. */
export function AmountField({ label, currency = "USDC", hint, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; currency?: string; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold">{label}</label>
      <div className="flex min-h-11 items-center rounded-[10px] border border-line bg-card pr-3.5 focus-within:outline-2 focus-within:outline-strong">
        <input id={id} inputMode="decimal" pattern="[0-9]*[.,]?[0-9]{0,6}" className="min-w-0 flex-1 rounded-[10px] bg-transparent px-3.5 py-2.5 font-mono text-sm text-ink outline-0" {...rest} />
        <span className="font-mono text-xs text-muted">{currency}</span>
      </div>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}
