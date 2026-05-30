export const env = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  footballDataApiKey: process.env.FOOTBALL_DATA_API_KEY ?? "",
  theSportsDbApiKey: process.env.THESPORTSDB_API_KEY ?? "",
  apiFootballKey: process.env.API_FOOTBALL_KEY ?? "",
};

export function hasDatabase() {
  return env.databaseUrl.length > 0;
}
