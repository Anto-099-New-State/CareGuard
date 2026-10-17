/**
 * Currencies a payer can choose. The contract always holds USDC; anything else is converted to USDC from the payer's
 * own wallet when they fund.
 *
 * Live on Arc today: USDC and EURC (App Kit swap supports USDC, EURC and cirBTC on Arc). The local-currency stablecoins
 * below are Circle's announced Arc partner stablecoins; they have no Arc contract addresses yet, so they're listed as
 * coming and can't be selected. When one launches, add its address and route here.
 *
 * Routes:
 *   native   - USDC itself, no conversion.
 *   appkit   - converted with Circle App Kit swap, signed by the payer's wallet. Works today for EURC.
 *   stablefx - Circle StableFX request-for-quote on Arc. Permissioned: needs an API key from Circle, so it's off until
 *              STABLEFX_API_KEY is set (FxEscrow is deployed on Arc testnet at 0xd68256f4D69C6BbEcB873D8588AE0Dc6B8E22E10).
 */

export type CurrencyStatus = "live" | "coming";
export type FxRoute = "native" | "appkit" | "stablefx";

export type CurrencyInfo = {
  code: string;
  name: string;
  region: string;
  symbol: string;
  status: CurrencyStatus;
  route: FxRoute | null;
  issuer?: string;
};

export const CURRENCIES: CurrencyInfo[] = [
  { code: "USDC", name: "US dollar", region: "United States", symbol: "$", status: "live", route: "native", issuer: "Circle" },
  { code: "EURC", name: "Euro", region: "Euro area", symbol: "€", status: "live", route: "appkit", issuer: "Circle" },
  { code: "JPYC", name: "Japanese yen", region: "Japan", symbol: "¥", status: "coming", route: null, issuer: "JPYC" },
  { code: "KRW1", name: "Korean won", region: "South Korea", symbol: "₩", status: "coming", route: null, issuer: "BDACS" },
  { code: "BRLA", name: "Brazilian real", region: "Brazil", symbol: "R$", status: "coming", route: null, issuer: "Avenia" },
  { code: "MXNB", name: "Mexican peso", region: "Mexico", symbol: "MX$", status: "coming", route: null, issuer: "Juno" },
  { code: "QCAD", name: "Canadian dollar", region: "Canada", symbol: "C$", status: "coming", route: null, issuer: "Stablecorp" },
  { code: "AUDF", name: "Australian dollar", region: "Australia", symbol: "A$", status: "coming", route: null, issuer: "Forte" },
  { code: "PHPC", name: "Philippine peso", region: "Philippines", symbol: "₱", status: "coming", route: null, issuer: "Coins.ph" },
  { code: "ZARU", name: "South African rand", region: "South Africa", symbol: "R", status: "coming", route: null, issuer: "ZAR Universal" },
];

export const LIVE_CURRENCIES = CURRENCIES.filter((c) => c.status === "live");
export const currency = (code: string) => CURRENCIES.find((c) => c.code === code);
