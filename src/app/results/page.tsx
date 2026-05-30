import { Suspense } from "react";
import ResultsPageClient from "@/components/ResultsPageClient";

export default function ResultsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[linear-gradient(180deg,#f7f7fb,white)]" />}>
      <ResultsPageClient />
    </Suspense>
  );
}
