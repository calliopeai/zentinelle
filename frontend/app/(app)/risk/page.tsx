import { redirect } from "next/navigation";

/**
 * Astrolift's SECURE portal links to /risk (singular). The register lives at
 * /risks, so this keeps the documented deeplink stable without duplicating
 * the page.
 */
export default function RiskDeeplinkPage() {
  redirect("/risks");
}
