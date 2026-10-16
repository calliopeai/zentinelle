"use client";

import { authenticatedFetch } from "@/lib/auth/fetch";
import { HttpLink } from "@apollo/client";
import {
  ApolloNextAppProvider,
  ApolloClient,
} from "@apollo/client-integration-nextjs";
import { getClientCache } from "./cache";
import { buildClientLinks } from "./links";

const GQL_URL =
  process.env.NEXT_PUBLIC_GQL_URL || "/gql/zentinelle/";

function makeClient(): ApolloClient {
  const httpLink = new HttpLink({
    uri: GQL_URL,
    fetch: authenticatedFetch,
    credentials: "include",
  });
  return new ApolloClient({
    link: buildClientLinks(httpLink),
    cache: getClientCache(),
  });
}

export function ApolloWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ApolloNextAppProvider makeClient={makeClient}>
      {children}
    </ApolloNextAppProvider>
  );
}
