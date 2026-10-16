import { ApolloLink, CombinedGraphQLErrors, HttpLink } from "@apollo/client";
import { ErrorLink } from "@apollo/client/link/error";

// "local", not "open" — see the note in app/(app)/layout.tsx. With open as the
// default, an UNAUTHENTICATED error was swallowed on every deployment, so a
// console with no session sat on empty pages instead of sending the operator to
// a login. This suppression is what made the failure silent.
const AUTH_MODE = process.env.NEXT_PUBLIC_AUTH_MODE || "local";

// Apollo Client 4 hands the handler one `error`; the Apollo 3 fields
// (graphQLErrors, networkError) are always undefined, so they never matched.
const errorLink = new ErrorLink(({ error }) => {
  if (CombinedGraphQLErrors.is(error)) {
    for (const err of error.errors) {
      // In open mode, never redirect to login
      if (err.extensions?.code === "UNAUTHENTICATED" && AUTH_MODE !== "open") {
        window.location.href = "/auth/login";
        return;
      }
    }
    return;
  }
  console.error("[Apollo] Network error:", error);
});

export function buildClientLinks(httpLink: HttpLink): ApolloLink {
  return ApolloLink.from([errorLink, httpLink]);
}
