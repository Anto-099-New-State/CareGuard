import type { Metadata } from "next";
import { Bricolage_Grotesque, Figtree, IBM_Plex_Mono } from "next/font/google";
import { TestnetBanner } from "@/components/TestnetBanner";
import "./globals.css";

const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"], weight: ["500", "600", "700", "800"] });
// Figtree: open, large x-height letterforms that stay readable at small sizes on phones; Bricolage stays for headings.
const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "CareGuard",
  description: "Multi-payer USDC escrow for medical treatment, paid per charge by an AI agent, settled on Arc.",
};

// Applies the saved theme before paint so there's no flash of the wrong theme.
const themeScript = `try{var t=localStorage.getItem("cg-theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${bricolage.variable} ${figtree.variable} ${plexMono.variable} antialiased`}>
        <TestnetBanner />
        {children}
      </body>
    </html>
  );
}
