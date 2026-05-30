import { env } from "../env";
import { fetchJson } from "../fetch-json";

const BASE = "https://api.football-data.org/v4";

function apiHeaders() {
  if (!env.footballDataApiKey) return null;
  return {
    "X-Auth-Token": env.footballDataApiKey,
  };
}

export async function fetchFootballDataCompetition() {
  const headers = apiHeaders();
  if (!headers) {
    return { available: false as const, reason: "football-data.org API key missing." };
  }

  const response = await fetchJson<Record<string, unknown>>(`${BASE}/competitions/BL1`, {
    timeoutMs: 12_000,
    headers,
  });

  if (!response.ok) {
    return {
      available: false as const,
      reason: `football-data.org request failed with status ${response.status}`,
      status: response.status,
      raw: response.rawText,
    };
  }

  return { available: true as const, data: response.data, status: response.status, raw: response.data };
}

export async function fetchFootballDataTeams() {
  const headers = apiHeaders();
  if (!headers) {
    return { available: false as const, reason: "football-data.org API key missing." };
  }

  const response = await fetchJson<Record<string, unknown>>(`${BASE}/competitions/BL1/teams`, {
    timeoutMs: 15_000,
    headers,
  });

  if (!response.ok) {
    return { available: false as const, reason: `football-data.org request failed with status ${response.status}` };
  }

  return { available: true as const, data: response.data };
}

export async function fetchFootballDataMatches() {
  const headers = apiHeaders();
  if (!headers) {
    return { available: false as const, reason: "football-data.org API key missing." };
  }

  const response = await fetchJson<Record<string, unknown>>(`${BASE}/competitions/BL1/matches?status=FINISHED`, {
    timeoutMs: 15_000,
    headers,
  });

  if (!response.ok) {
    return { available: false as const, reason: `football-data.org request failed with status ${response.status}` };
  }

  return { available: true as const, data: response.data };
}

export async function fetchFootballDataTeamSquad(teamId: number) {
  const headers = apiHeaders();
  if (!headers) {
    return { available: false as const, reason: "football-data.org API key missing." };
  }

  const response = await fetchJson<Record<string, unknown>>(`${BASE}/teams/${teamId}`, {
    timeoutMs: 15_000,
    headers,
  });

  if (!response.ok) {
    return { available: false as const, reason: `football-data.org request failed with status ${response.status}` };
  }

  return { available: true as const, data: response.data };
}
