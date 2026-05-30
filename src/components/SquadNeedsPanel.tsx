import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export function SquadNeedsPanel({
  needs,
}: {
  needs: Array<{ label: string; value: number }>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Squad Needs</CardTitle>
        <CardDescription>Real-time squad balance pressure by role.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {needs.map((need) => (
          <div key={need.label} className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700">{need.label}</span>
              <span className="text-slate-500">{need.value}%</span>
            </div>
            <Progress value={need.value} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
