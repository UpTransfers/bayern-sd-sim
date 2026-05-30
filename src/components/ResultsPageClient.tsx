"use client";

import { useSearchParams } from "next/navigation";
import SeasonReportPage from "@/components/SeasonReportPage";

export default function ResultsPageClient() {
  const searchParams = useSearchParams();
  return <SeasonReportPage simulationId={searchParams.get("simulationId")} />;
}
