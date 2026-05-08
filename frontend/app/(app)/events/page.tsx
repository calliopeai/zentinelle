"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
  RadioIcon,
  SearchIcon,
} from "lucide-react";
import { useEvents } from "@/graphql/events/hooks";
import type { EventData } from "@/graphql/events/types";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const POLL_MS = 5000;
const FRESH_WINDOW_MS = 6000;
const SCROLL_TOP_THRESHOLD = 120;

// ── Color coding ──────────────────────────────────────────────────────────

function categoryVariant(
  category: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (category) {
    case "audit":
      return "default";
    case "alert":
      return "destructive";
    case "telemetry":
      return "secondary";
    default:
      return "outline";
  }
}

function eventTypeAccent(eventType: string): string {
  // Color the event type label by its dominant prefix
  const prefix = eventType.split(".")[0] ?? eventType;
  switch (prefix) {
    case "policy":
      return "text-violet-600 dark:text-violet-400";
    case "agent":
      return "text-sky-600 dark:text-sky-400";
    case "alert":
      return "text-red-600 dark:text-red-400";
    case "audit":
      return "text-emerald-600 dark:text-emerald-400";
    case "scan":
    case "scanner":
      return "text-amber-600 dark:text-amber-400";
    case "model":
      return "text-fuchsia-600 dark:text-fuchsia-400";
    default:
      return "text-foreground";
  }
}

function statusVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "processed":
      return "default";
    case "failed":
    case "error":
      return "destructive";
    case "pending":
    case "queued":
      return "secondary";
    default:
      return "outline";
  }
}

function formatTimestamp(ts: string) {
  const date = new Date(ts);
  return date.toLocaleString();
}

function relativeTime(ts: string) {
  const now = Date.now();
  const then = new Date(ts).getTime();
  const diff = Math.max(0, Math.floor((now - then) / 1000));
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── Payload row ───────────────────────────────────────────────────────────

function ExpandablePayload({
  payload,
}: {
  payload: Record<string, unknown> | null;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!payload || Object.keys(payload).length === 0) {
    return <span className="text-muted-foreground text-xs">no payload</span>;
  }
  return (
    <div className="text-xs">
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? (
          <ChevronDownIcon className="h-3 w-3" />
        ) : (
          <ChevronRightIcon className="h-3 w-3" />
        )}
        {expanded ? "Hide payload" : "View payload"}
      </button>
      {expanded && (
        <pre className="bg-muted/60 mt-1.5 max-h-48 overflow-auto rounded-md p-2 font-mono text-[11px] leading-relaxed">
          {JSON.stringify(payload, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function EventsPage() {
  // Filters
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Live mode
  const [liveOn, setLiveOn] = useState(false);
  const [paused, setPaused] = useState(false);

  // Track which event IDs have ever appeared so we can flag fresh ones
  const seenIdsRef = useRef<Set<string>>(new Set());
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  const pollInterval = liveOn && !paused ? POLL_MS : 0;

  const { events, loading, refetch } = useEvents(undefined, {
    pollInterval: pollInterval || undefined,
  });

  // Track newly arrived events while live mode is on
  useEffect(() => {
    if (events.length === 0) {
      seenIdsRef.current = new Set(events.map((e) => e.id));
      return;
    }

    const seen = seenIdsRef.current;
    const newIds: string[] = [];

    if (seen.size === 0) {
      // First population — seed without flagging anything as fresh
      events.forEach((e) => seen.add(e.id));
      return;
    }

    events.forEach((e) => {
      if (!seen.has(e.id)) {
        seen.add(e.id);
        newIds.push(e.id);
      }
    });

    if (newIds.length === 0) return;

    setFreshIds((prev) => {
      const next = new Set(prev);
      newIds.forEach((id) => next.add(id));
      return next;
    });

    // Auto-scroll to top only if user is already near the top
    const c = containerRef.current;
    if (c && c.scrollTop <= SCROLL_TOP_THRESHOLD) {
      c.scrollTo({ top: 0, behavior: "smooth" });
    }

    // Clear the fresh flag after the animation completes
    const timer = setTimeout(() => {
      setFreshIds((prev) => {
        const next = new Set(prev);
        newIds.forEach((id) => next.delete(id));
        return next;
      });
    }, FRESH_WINDOW_MS);

    return () => clearTimeout(timer);
  }, [events]);

  const handleLiveToggle = (next: boolean) => {
    setLiveOn(next);
    if (!next) setPaused(false);
  };

  // Apply filters client-side (server doesn't filter on search/category in our hook call)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      if (categoryFilter !== "all" && e.eventCategory !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        e.eventType,
        e.eventCategory,
        e.endpointName ?? "",
        e.userIdentifier ?? "",
        e.status,
        e.correlationId ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [events, search, categoryFilter]);

  // ── Header / control bar ────────────────────────────────────────────────

  if (loading && events.length === 0) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div>
          <Skeleton className="h-7 w-32" />
          <Skeleton className="mt-1 h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[480px] w-full rounded-md" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-5 p-6">
      {/* Title row */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Events</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Real-time telemetry, audit, and alert events from your AI agents
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Live counter */}
          <div className="text-muted-foreground text-xs">
            {filtered.length} of {events.length} events
          </div>

          {/* Pause/Resume — only when live */}
          {liveOn && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPaused((p) => !p)}
            >
              {paused ? (
                <>
                  <PlayIcon className="mr-1.5 h-3.5 w-3.5" />
                  Resume
                </>
              ) : (
                <>
                  <PauseIcon className="mr-1.5 h-3.5 w-3.5" />
                  Pause
                </>
              )}
            </Button>
          )}

          {/* Live toggle */}
          <div
            className={`flex items-center gap-2 rounded-md border px-3 py-1.5 transition-colors ${
              liveOn
                ? "border-red-500/30 bg-red-500/5"
                : "border-border bg-card"
            }`}
          >
            <RadioIcon
              className={`h-3.5 w-3.5 ${
                liveOn && !paused
                  ? "text-red-500 animate-live-pulse"
                  : "text-muted-foreground"
              }`}
            />
            <Label
              htmlFor="live-toggle"
              className="cursor-pointer text-xs font-medium"
            >
              Live
            </Label>
            <Switch
              id="live-toggle"
              checked={liveOn}
              onCheckedChange={handleLiveToggle}
            />
          </div>

          {/* Manual refresh */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => refetch()}
            disabled={liveOn && !paused}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-md border p-3">
        <div className="relative max-w-sm flex-1">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search type, endpoint, user, correlation id…"
            className="h-8 pl-8 text-sm"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-8 w-[160px] text-sm">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="telemetry">Telemetry</SelectItem>
            <SelectItem value="audit">Audit</SelectItem>
            <SelectItem value="alert">Alert</SelectItem>
          </SelectContent>
        </Select>
        {(search || categoryFilter !== "all") && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            onClick={() => {
              setSearch("");
              setCategoryFilter("all");
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Stream */}
      <div
        ref={containerRef}
        className="bg-card max-h-[calc(100vh-260px)] overflow-y-auto rounded-md border"
      >
        {filtered.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 px-6 py-16 text-sm">
            <RadioIcon className="h-8 w-8 opacity-30" />
            {events.length === 0 ? (
              <p>
                No events yet
                {liveOn ? " — listening…" : ". Toggle Live to start streaming."}
              </p>
            ) : (
              <p>No events match the current filters.</p>
            )}
          </div>
        ) : (
          <ul className="divide-y">
            {filtered.map((event: EventData) => {
              const isFresh = freshIds.has(event.id);
              return (
                <li
                  key={event.id}
                  className={`px-4 py-3 transition-colors ${
                    isFresh ? "animate-event-fade-in" : ""
                  }`}
                >
                  <div className="flex flex-wrap items-start gap-x-4 gap-y-1.5">
                    {/* Type */}
                    <div className="min-w-[200px] flex-1">
                      <span
                        className={`font-mono text-sm font-medium ${eventTypeAccent(
                          event.eventType
                        )}`}
                      >
                        {event.eventType}
                      </span>
                      {isFresh && (
                        <span className="ml-2 inline-flex items-center rounded-sm bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400">
                          NEW
                        </span>
                      )}
                    </div>

                    {/* Category */}
                    <Badge variant={categoryVariant(event.eventCategory)}>
                      {event.eventCategory}
                    </Badge>

                    {/* Status */}
                    <Badge variant={statusVariant(event.status)}>
                      {event.status}
                    </Badge>

                    {/* Timestamp */}
                    <div
                      className="text-muted-foreground shrink-0 text-xs"
                      title={formatTimestamp(event.occurredAt)}
                    >
                      {relativeTime(event.occurredAt)}
                    </div>
                  </div>

                  {/* Meta row */}
                  <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    {event.endpointName && (
                      <span>
                        <span className="font-medium">endpoint:</span>{" "}
                        {event.endpointName}
                      </span>
                    )}
                    {event.userIdentifier && (
                      <span>
                        <span className="font-medium">user:</span>{" "}
                        {event.userIdentifier}
                      </span>
                    )}
                    {event.correlationId && (
                      <span className="font-mono">
                        <span className="font-medium">corr:</span>{" "}
                        {event.correlationId.slice(0, 12)}
                      </span>
                    )}
                    <span>{formatTimestamp(event.occurredAt)}</span>
                  </div>

                  {/* Payload */}
                  <div className="mt-1.5">
                    <ExpandablePayload payload={event.payload} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
