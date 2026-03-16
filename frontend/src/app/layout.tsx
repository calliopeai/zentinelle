'use client';

import React, { ReactNode, useState } from 'react';
import 'styles/App.css';
import { ChakraProvider, Portal, Box, useDisclosure } from '@chakra-ui/react';
import { UserProvider } from '@auth0/nextjs-auth0/client';
import dynamic from 'next/dynamic';
import initialTheme from 'theme/theme';
import { ConfiguratorContext } from 'contexts/ConfiguratorContext';
import { ApolloWrapper } from 'utils/apollo-wrapper';
import { OrganizationProvider } from 'contexts/OrganizationContext';
import { AuthProvider } from 'contexts/AuthContext';
import Footer from 'components/footer/FooterAdmin';
import Navbar from 'components/navbar/NavbarAdmin';
import Sidebar from 'components/sidebar/Sidebar';
import { SessionInitializer } from 'components/SessionInitializer';
import { usePathname } from 'next/navigation';
import routes from 'routes';
import { getActiveNavbar, getActiveRoute, isWindowAvailable } from 'utils/navigation';

const _NoSSR = ({ children }: { children: ReactNode }) => <>{children}</>;

const NoSSR = dynamic(() => Promise.resolve(_NoSSR), {
  ssr: false,
});

function ZentinelleLayout({ children }: { children: ReactNode }) {
  const [fixed] = useState(false);
  const pathname = usePathname();
  if (isWindowAvailable()) document.documentElement.dir = 'ltr';
  const { onOpen } = useDisclosure();
  const [mini, setMini] = useState(false);
  const [hovered, setHovered] = useState(false);

  return (
    <Box>
<Sidebar
        mini={mini}
        routes={routes}
        hovered={hovered}
        setHovered={setHovered}
      />
      <Box
        float="right"
        minHeight="100vh"
        height="100%"
        overflow="auto"
        position="relative"
        maxHeight="100%"
        w={
          mini === false
            ? { base: '100%', xl: 'calc( 100% - 290px )' }
            : mini === true && hovered === true
            ? { base: '100%', xl: 'calc( 100% - 290px )' }
            : { base: '100%', xl: 'calc( 100% - 120px )' }
        }
        maxWidth={
          mini === false
            ? { base: '100%', xl: 'calc( 100% - 290px )' }
            : mini === true && hovered === true
            ? { base: '100%', xl: 'calc( 100% - 290px )' }
            : { base: '100%', xl: 'calc( 100% - 120px )' }
        }
        transition="all 0.33s cubic-bezier(0.685, 0.0473, 0.346, 1)"
        transitionDuration=".2s, .2s, .35s"
        transitionProperty="top, bottom, width"
        transitionTimingFunction="linear, linear, ease"
      >
        <Portal>
          <Box>
            <Navbar
              onOpen={onOpen}
              logoText={'Zentinelle'}
              brandText={getActiveRoute(routes, pathname)}
              secondary={getActiveNavbar(routes, pathname)}
              fixed={fixed}
            />
          </Box>
        </Portal>

        <Box
          mx="auto"
          p={{ base: '20px', md: '30px' }}
          pe="20px"
          minH="100vh"
          pt="50px"
        >
          {children}
        </Box>
        <Box>
          <Footer />
        </Box>
      </Box>
    </Box>
  );
}

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [mini, setMini] = useState(false);
  const [contrast, setContrast] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [theme, setTheme] = useState(initialTheme);

  return (
    <html lang="en">
      <body id={'root'}>
        <NoSSR>
          <UserProvider>
            <ConfiguratorContext.Provider
              value={{
                mini,
                setMini,
                theme,
                setTheme,
                hovered,
                setHovered,
                contrast,
                setContrast,
              }}
            >
              <ChakraProvider theme={theme}>
                <AuthProvider>
                  <SessionInitializer>
                    <ApolloWrapper>
                      <OrganizationProvider>
                        <ZentinelleLayout>{children}</ZentinelleLayout>
                      </OrganizationProvider>
                    </ApolloWrapper>
                  </SessionInitializer>
                </AuthProvider>
              </ChakraProvider>
            </ConfiguratorContext.Provider>
          </UserProvider>
        </NoSSR>
      </body>
    </html>
  );
}
