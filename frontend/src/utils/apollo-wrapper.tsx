'use client';

import {
  ApolloLink,
  createHttpLink,
} from '@apollo/client';
import {
  NextSSRApolloClient,
  ApolloNextAppProvider,
  NextSSRInMemoryCache,
  SSRMultipartLink,
} from '@apollo/experimental-nextjs-app-support/ssr';
import { setContext } from '@apollo/client/link/context';
import { parseCookies } from 'nookies';
import { getSessionKey } from './session';

// GraphQL endpoint: env var for standalone deployment, default for local dev
const GRAPHQL_ENDPOINT = process.env.NEXT_PUBLIC_GQL_URL || 'http://localhost/gql/zentinelle/';

function makeClient() {
  const authLink = setContext((_, previewsContext) => {
    let cookieHeader = '';
    let csrfTokenHeader = '';

    const sessionKey = typeof window !== 'undefined' ? getSessionKey() : null;

    if (previewsContext.req) {
      cookieHeader = previewsContext?.req?.headers?.cookie || '';
      csrfTokenHeader = parseCookies(previewsContext).csrftoken || '';

      return {
        headers: {
          Cookie: cookieHeader,
          'X-CSRFToken': csrfTokenHeader,
          ...(sessionKey && { Authorization: `Session ${sessionKey}` }),
        },
      };
    }

    csrfTokenHeader = parseCookies().csrftoken || '';
    return {
      headers: {
        'X-CSRFToken': csrfTokenHeader,
        ...(sessionKey && { Authorization: `Session ${sessionKey}` }),
      },
    };
  });

  const httpLink2 = createHttpLink({
    uri: GRAPHQL_ENDPOINT,
    credentials: 'include',
  });

  const httpLink = authLink.concat(httpLink2);

  return new NextSSRApolloClient({
    cache: new NextSSRInMemoryCache(),
    link:
      typeof window === 'undefined'
        ? ApolloLink.from([
            new SSRMultipartLink({
              stripDefer: true,
            }),
            httpLink,
          ])
        : httpLink,
  });
}

export function ApolloWrapper({ children }: React.PropsWithChildren) {
  return (
    <ApolloNextAppProvider makeClient={makeClient}>
      {children}
    </ApolloNextAppProvider>
  );
}
