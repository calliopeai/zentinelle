"use client";

import { HttpLink } from "@apollo/client";
import {
  ApolloNextAppProvider,
  ApolloClient,
} from "@apollo/client-integration-nextjs";
import { getClientCache } from "./cache";

const GQL_URL =
  process.env.NEXT_PUBLIC_GQL_URL || "http://localhost:8080/gql/zentinelle/";

function makeClient(): ApolloClient {
  const httpLink = new HttpLink({
    uri: GQL_URL,
    credentials: "include",
  });
  return new ApolloClient({
    link: httpLink,
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
