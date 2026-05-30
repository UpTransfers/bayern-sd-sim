import { env } from "../env";
import { fetchJson } from "../fetch-json";

const BASE = "https://www.thesportsdb.com/api/v1/json";
const FALLBACK_KEY = "1";

function apiKey() {
  return env.theSportsDbApiKey || FALLBACK_KEY;
}

export async function searchTheSportsDbPlayers(query: string) {
  if (!query.trim()) {
    return { available: false as const, reason: "Empty player search query." };
  }

  const response = await fetchJson<Record<string, unknown>>(
    `${BASE}/${apiKey()}/searchplayers.php?p=${encodeURIComponent(query)}`,
    { timeoutMs: 15_000 },
  );

  if (!response.ok) {
    return { available: false as const, reason: `TheSportsDB request failed with status ${response.status}` };
  }

  return { available: true as const, data: response.data };
}

export async function searchTheSportsDbTeamPlayers(team: string) {
  const response = await fetchJson<Record<string, unknown>>(
    `${BASE}/${apiKey()}/searchplayers.php?t=${encodeURIComponent(team)}`,
    { timeoutMs: 15_000 },
  );

  if (!response.ok) {
    return { available: false as const, reason: `TheSportsDB request failed with status ${response.status}` };
  }

  return { available: true as const, data: response.data };
}
