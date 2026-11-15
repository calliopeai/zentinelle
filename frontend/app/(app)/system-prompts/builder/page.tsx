import { redirect } from "next/navigation";

/**
 * The old prompt builder (ui-overhaul-ia §4.4): with `?id=`, that prompt's
 * page; without, a new prompt from a template.
 */
export default async function PromptBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  redirect(
    id
      ? `/system-prompts/${encodeURIComponent(id)}`
      : "/system-prompts/new?mode=template",
  );
}
