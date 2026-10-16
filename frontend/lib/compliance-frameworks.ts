/**
 * The frameworks /compliance/[framework] describes, by the slug in its URL,
 * each with the id the backend gives it (FRAMEWORK_REQUIREMENTS in
 * backend/zentinelle/models/compliance.py). A framework the backend tracks
 * that is not listed here has no detail page, so nothing links to one.
 */
export const FRAMEWORK_PAGES: Record<
  string,
  { backendId: string; name: string; fullName: string; description: string }
> = {
  soc2: {
    backendId: "SOC2",
    name: "SOC 2",
    fullName: "SOC 2 Type II: Trust Services Criteria",
    description:
      "Security, availability, processing integrity, confidentiality, and privacy controls for service organizations.",
  },
  gdpr: {
    backendId: "GDPR",
    name: "GDPR",
    fullName: "General Data Protection Regulation (EU)",
    description:
      "European Union regulation on data protection and privacy for individuals within the EU and EEA.",
  },
  hipaa: {
    backendId: "HIPAA",
    name: "HIPAA",
    fullName: "Health Insurance Portability and Accountability Act",
    description:
      "US regulation for protecting sensitive patient health information (PHI).",
  },
  "eu-ai-act": {
    backendId: "EU_AI_ACT",
    name: "EU AI Act",
    fullName: "European Union Artificial Intelligence Act",
    description:
      "First comprehensive AI regulation. Risk-based approach to AI governance.",
  },
  nist: {
    backendId: "NIST_AI_RMF",
    name: "NIST AI RMF",
    fullName: "NIST AI Risk Management Framework",
    description:
      "Voluntary framework for managing AI risks throughout the AI lifecycle.",
  },
};

/** The detail page of a backend framework id, or null when it has none. */
export function frameworkPageHref(
  backendId: string | null | undefined,
): string | null {
  const slug = Object.keys(FRAMEWORK_PAGES).find(
    (key) => FRAMEWORK_PAGES[key].backendId === backendId,
  );
  return slug ? `/compliance/${slug}` : null;
}
