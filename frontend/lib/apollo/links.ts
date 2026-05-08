import { ApolloLink, HttpLink } from "@apollo/client";
import { onError } from "@apollo/client/link/error";

const AUTH_MODE = process.env.NEXT_PUBLIC_AUTH_MODE || "open";

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
