"use client";

import { useState } from "react";
import { useSystemPrompts } from "@/graphql/prompts/hooks";
import type { SystemPromptData } from "@/graphql/prompts/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  StarIcon,
  SparklesIcon,
  BadgeCheckIcon,
  UsersIcon,
  BookOpenIcon,
} from "lucide-react";

function PromptCard({ prompt }: { prompt: SystemPromptData }) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="line-clamp-1 text-sm">
            {prompt.name ?? "Untitled"}
          </CardTitle>
          <div className="flex shrink-0 gap-1">
            {prompt.isFeatured && (
              <SparklesIcon className="h-4 w-4 text-amber-500" />
            )}
            {prompt.isVerified && (
              <BadgeCheckIcon className="h-4 w-4 text-blue-500" />
            )}
          </div>
        </div>
        {prompt.description && (
          <CardDescription className="line-clamp-2 text-xs">
            {prompt.description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1">
            {prompt.promptTypeDisplay && (
              <Badge variant="outline" className="text-[10px]">
                {prompt.promptTypeDisplay}
              </Badge>
            )}
            {prompt.category && (
              <Badge variant="secondary" className="text-[10px]">
                {prompt.category.name}
              </Badge>
            )}
            {prompt.visibility && (
              <Badge
                variant={prompt.visibility === "public" ? "default" : "outline"}
                className="text-[10px]"
              >
                {prompt.visibilityDisplay ?? prompt.visibility}
              </Badge>
            )}
          </div>

          {(prompt.tags?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1">
              {prompt.tags?.slice(0, 3).map((tag) => (
                <Badge key={tag.id} variant="outline" className="text-[10px]">
                  {tag.name}
                </Badge>
              ))}
              {(prompt.tags?.length ?? 0) > 3 && (
                <Badge variant="outline" className="text-[10px]">
                  +{(prompt.tags?.length ?? 0) - 3}
                </Badge>
              )}
            </div>
          )}

          <div className="text-muted-foreground flex items-center gap-3 pt-1 text-xs">
            <span className="flex items-center gap-1">
              <UsersIcon className="h-3 w-3" />
              {prompt.usageCount ?? 0}
            </span>
            {prompt.avgRating != null && prompt.avgRating > 0 && (
              <span className="flex items-center gap-1">
                <StarIcon className="h-3 w-3 fill-amber-400 text-amber-400" />
                {prompt.avgRating.toFixed(1)}
              </span>
            )}
            {prompt.version != null && (
              <span>v{prompt.version}</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SystemPromptsPage() {
  const [search, setSearch] = useState("");
  const [categorySlug, setCategorySlug] = useState<string | undefined>();
  const [featuredOnly, setFeaturedOnly] = useState<boolean | undefined>();

  const { prompts, loading } = useSystemPrompts({
    search: search || undefined,
    categorySlug,
    featuredOnly,
  });

  const categories = [
    ...new Map(
      prompts
        .filter((p) => p.category)
        .map((p) => [p.category!.slug, p.category!])
    ).values(),
  ];

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div>
          <Skeleton className="h-7 w-40" />
          <Skeleton className="mt-1 h-4 w-64" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-32" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-3 w-56" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-16 w-full rounded-md" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">System Prompts</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Browse and manage system prompt templates for your AI agents
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search prompts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-56"
        />
        <Select
          value={categorySlug ?? "all"}
          onValueChange={(v) => setCategorySlug(v === "all" ? undefined : v)}
        >
          <SelectTrigger className="h-8 w-40">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.slug} value={cat.slug}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={featuredOnly === true ? "featured" : "all"}
          onValueChange={(v) =>
            setFeaturedOnly(v === "featured" ? true : undefined)
          }
        >
          <SelectTrigger className="h-8 w-32">
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Prompts</SelectItem>
            <SelectItem value="featured">Featured Only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {prompts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <BookOpenIcon className="text-muted-foreground mb-3 h-10 w-10" />
          <p className="text-muted-foreground text-sm">No prompts found</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {prompts.map((prompt) => (
            <PromptCard key={prompt.id} prompt={prompt} />
          ))}
        </div>
      )}
    </div>
  );
}
