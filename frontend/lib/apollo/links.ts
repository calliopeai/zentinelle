import { ApolloLink, HttpLink } from "@apollo/client";
import { onError } from "@apollo/client/link/error";

// "local", not "open" — see the note in app/(app)/layout.tsx. With open as the
// default, an UNAUTHENTICATED error was swallowed on every deployment, so a
// console with no session sat on empty pages instead of sending the operator to
// a login. This suppression is what made the failure silent.
const AUTH_MODE = process.env.NEXT_PUBLIC_AUTH_MODE || "local";

const errorLink = onError(({ graphQLErrors, networkError }: any) => {
  if (graphQLErrors) {
    for (const err of graphQLErrors) {
      // In open mode, never redirect to login
      if (err.extensions?.code === "UNAUTHENTICATED" && AUTH_MODE !== "open") {
        window.location.href = "/auth/login";
        return;
      }
    }
  }
  if (networkError) {
    console.error("[Apollo] Network error:", networkError);
  }
});

export function buildClientLinks(httpLink: HttpLink): ApolloLink {
  return ApolloLink.from([errorLink, httpLink]);
}
