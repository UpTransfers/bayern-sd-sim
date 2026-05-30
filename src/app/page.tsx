import { HeroStart } from "@/components/HeroStart";
import { env } from "@/lib/env";

export default function HomePage() {
  const dataMode = env.footballDataApiKey
    ? "football-data enabled"
    : "free source fallback";

  return <HeroStart dataMode={dataMode} />;
}
