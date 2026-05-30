import { DashboardShell } from "@/components/DashboardShell";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ simulationId: string }>;
}) {
  const { simulationId } = await params;
  return <DashboardShell simulationId={simulationId} />;
}
