import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

export function DecisionFeed({
  events,
}: {
  events: Array<{
    id: string;
    event_type: string;
    title: string;
    description: string;
    created_at: string;
  }>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Decision Feed</CardTitle>
        <CardDescription>Everything that changed in chronological order.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {events.length ? (
          events.slice(0, 6).map((event) => (
            <div key={event.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-slate-900">{event.title}</p>
                <span className="text-xs text-slate-500">{formatDate(event.created_at)}</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{event.description}</p>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-600">No decisions recorded yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
