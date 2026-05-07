import { HttpLink } from "@apollo/client";
import {
  registerApolloClient,
  ApolloClient,
} from "@apollo/client-integration-nextjs";
import { cookies } from "next/headers";
import { makeCache } from "./cache";

const GQL_URL =
  process.env.NEXT_PUBLIC_GQL_URL || "http://localhost:8080/gql/zentinelle/";

export const { getClient, query, PreloadQuery } = registerApolloClient(
  async () => {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("zentinelle_session")?.value;
    const csrfToken = cookieStore.get("csrftoken")?.value;

    const httpLink = new HttpLink({
      uri: GQL_URL,
      credentials: "include",
      headers: {
        ...(sessionCookie
          ? { Cookie: `zentinelle_session=${sessionCookie}` }
          : {}),
        ...(csrfToken ? { "X-CSRFToken": csrfToken } : {}),
      },
    });

    return new ApolloClient({
      cache: makeCache(),
      link: httpLink,
    });
  },
);
