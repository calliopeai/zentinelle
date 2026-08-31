import { redirect } from "next/navigation";

export default async function AgentIndexPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  redirect(`/agents/${agentId}/activity`);
}
