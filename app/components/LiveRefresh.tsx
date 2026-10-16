"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

/**
 * Subscribes once per page to realtime changes and re-renders the server data when anything changes.
 * RLS decides which rows reach this browser.
 */
export function LiveRefresh({ channel, tables, episodeId }: { channel: string; tables: string[]; episodeId?: string }) {
  const router = useRouter();
  const tableList = tables.join(","); // stable dependency: one subscription per page, not per render

  useEffect(() => {
    const supabase = supabaseBrowser();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 250); // coalesce bursts (decision + charge + episode)
    };
    let ch = supabase.channel(channel);
    for (const table of tableList.split(",")) {
      const filter = episodeId ? (table === "episodes" ? `id=eq.${episodeId}` : `episode_id=eq.${episodeId}`) : undefined;
      ch = ch.on("postgres_changes", { event: "*", schema: "public", table, ...(filter ? { filter } : {}) }, refresh);
    }
    ch.subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(ch);
    };
  }, [router, channel, tableList, episodeId]);

  return null;
}
