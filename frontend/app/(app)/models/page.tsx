"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CpuIcon } from "lucide-react";

const MODELS = [
  { id: "gpt-4o", provider: "OpenAI", type: "LLM", context: "128K", inputPrice: "$2.50", outputPrice: "$10.00" },
  { id: "gpt-4o-mini", provider: "OpenAI", type: "LLM", context: "128K", inputPrice: "$0.15", outputPrice: "$0.60" },
  { id: "o1", provider: "OpenAI", type: "Reasoning", context: "200K", inputPrice: "$15.00", outputPrice: "$60.00" },
  { id: "claude-opus-4-20250514", provider: "Anthropic", type: "LLM", context: "200K", inputPrice: "$15.00", outputPrice: "$75.00" },
  { id: "claude-sonnet-4-20250514", provider: "Anthropic", type: "LLM", context: "200K", inputPrice: "$3.00", outputPrice: "$15.00" },
  { id: "claude-3-5-haiku-20241022", provider: "Anthropic", type: "LLM", context: "200K", inputPrice: "$0.80", outputPrice: "$4.00" },
  { id: "gemini-2.5-pro", provider: "Google", type: "LLM", context: "1M", inputPrice: "$1.25", outputPrice: "$10.00" },
  { id: "gemini-2.5-flash", provider: "Google", type: "LLM", context: "1M", inputPrice: "$0.15", outputPrice: "$0.60" },
];

export default function ModelsPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Model Registry</h1>
        <p className="text-muted-foreground">AI models available for agent use, synced from providers</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {MODELS.map((m) => (
          <Card key={m.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">{m.id}</CardTitle>
                <Badge variant="outline">{m.provider}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted-foreground">Type:</span> {m.type}</div>
                <div><span className="text-muted-foreground">Context:</span> {m.context}</div>
                <div><span className="text-muted-foreground">Input:</span> {m.inputPrice}/M</div>
                <div><span className="text-muted-foreground">Output:</span> {m.outputPrice}/M</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
