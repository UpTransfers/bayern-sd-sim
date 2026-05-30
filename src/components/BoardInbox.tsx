import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function BoardInbox({
  messages,
}: {
  messages: Array<{ tone: "good" | "warn" | "neutral"; title: string; body: string }>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Boardroom Inbox</CardTitle>
        <CardDescription>Short reactions triggered by your decisions.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {messages.length ? (
          messages.slice(0, 4).map((message, index) => (
            <div key={`${message.title}-${index}`} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-slate-900">{message.title}</p>
                <Badge tone={message.tone === "good" ? "success" : message.tone === "warn" ? "warning" : "muted"}>
                  {message.tone}
                </Badge>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{message.body}</p>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-600">No board messages yet. Make a decision to generate feedback.</p>
        )}
      </CardContent>
    </Card>
  );
}
