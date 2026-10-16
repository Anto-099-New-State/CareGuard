import type { DashboardData } from "./types";

/**
 * Provider dashboard data. Until GET /api/episodes exists this returns an empty dashboard:
 * per the docs, the app never shows sample data — empty states explain what will appear.
 */
export async function getDashboard(): Promise<DashboardData> {
  return { providerName: null, episodes: [], decisions: [], marginCalls: [] };
}
