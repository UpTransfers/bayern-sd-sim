"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SeasonFeedPost } from "@/lib/football/seasonFeed";
import { Sparkles, Newspaper, MessageCircle, Mic2 } from "lucide-react";

const toneStyles = {
  news: {
    icon: Newspaper,
    panel: "border-slate-200 bg-white",
    badge: "muted" as const,
  },
  banter: {
    icon: MessageCircle,
    panel: "border-amber-200 bg-amber-50/60",
    badge: "gold" as const,
  },
  fan: {
    icon: Mic2,
    panel: "border-rose-200 bg-rose-50/60",
    badge: "success" as const,
  },
  analysis: {
    icon: Sparkles,
    panel: "border-slate-200 bg-slate-50",
    badge: "muted" as const,
  },
} satisfies Record<SeasonFeedPost["tone"], { icon: typeof Newspaper; panel: string; badge: "muted" | "gold" | "success" }>;

export function SeasonSocialFeed({ posts }: { posts: SeasonFeedPost[] }) {
  return (
    <Card className="border-slate-200">
      <CardHeader>
        <CardTitle>Social feed</CardTitle>
        <CardDescription>How the season sounded around the club. Short, sharp, and tied to what actually happened.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 lg:grid-cols-2">
          {posts.map((post, index) => {
            const style = toneStyles[post.tone];
            const Icon = style.icon;
            return (
              <div key={`${post.source}-${post.headline}-${index}`} className={`rounded-2xl border p-4 shadow-sm ${style.panel}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{post.source}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">{post.headline}</p>
                  </div>
                  <Badge tone={style.badge}>
                    <Icon className="mr-1 h-3.5 w-3.5" />
                    {post.handle}
                  </Badge>
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-700">{post.body}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
