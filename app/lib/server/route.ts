import { NextResponse } from "next/server";
import { z } from "zod";
import { parseAmount } from "../money";
import { UserError } from "./errors";

/** JSON with bigints as strings: amounts in base units, e.g. "125000000" for 125.00 USDC. */
export function ok(data: unknown, status = 200) {
  return new NextResponse(JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v)), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Wraps a route so every failure returns { error: "<what went wrong and how to fix it>" }. */
export function handle<C>(fn: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof UserError) return NextResponse.json({ error: err.message }, { status: err.status });
      if (err instanceof z.ZodError) {
        const issue = err.issues[0];
        return NextResponse.json({ error: `${issue.path.join(".") || "body"}: ${issue.message}` }, { status: 400 });
      }
      console.error(err);
      return NextResponse.json({ error: "Something went wrong on our side. Nothing was charged; try again." }, { status: 500 });
    }
  };
}

export async function body<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new UserError("Send a JSON body.");
  }
  return schema.parse(raw);
}

/** Amounts arrive as decimal strings ("125.00") and become base-unit bigints. */
export const amount = z.string().transform((v, ctx) => {
  try {
    return parseAmount(v);
  } catch (err) {
    ctx.addIssue({ code: "custom", message: err instanceof Error ? err.message : "Not an amount." });
    return z.NEVER;
  }
});

/** Percentages arrive as numbers (20 = 20%) and become basis points. */
export const percent = z.number().min(0).max(100).transform((v) => Math.round(v * 100));

export const currency = z.enum(["USDC", "EURC"]);
