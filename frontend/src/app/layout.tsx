'use client';

import React, { ReactNode, useState } from 'react';
import 'styles/App.css';
import {
  Box,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  ChakraProvider,
  Portal,
  Text,
  useColorModeValue,
  useDisclosure,
} from '@chakra-ui/react';
import { UserProvider } from '@auth0/nextjs-auth0/client';
import dynamic from 'next/dynamic';
import initialTheme from 'theme/theme';
import { ConfiguratorContext } from 'contexts/ConfiguratorContext';
import { ApolloWrapper } from 'utils/apollo-wrapper';
import { OrganizationProvider } from 'contexts/OrganizationContext';
import { AuthProvider } from 'contexts/AuthContext';
import { PageHeaderProvider, useCurrentPageHeader } from 'contexts/PageHeaderContext';
import Footer from 'components/footer/FooterAdmin';
import Navbar from 'components/navbar/NavbarAdmin';
import Sidebar from 'components/sidebar/Sidebar';
import { SessionInitializer } from 'components/SessionInitializer';
import { usePathname } from 'next/navigation';
import routes from 'routes';
import { getActiveNavbar, getActiveParent, getActiveRoute, isWindowAvailable } from 'utils/navigation';

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
  const pageHeader = useCurrentPageHeader();
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const subtitleColor = useColorModeValue('gray.500', 'secondaryGray.500');

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
              parentText={getActiveParent(routes, pathname)}
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
          pt={{ base: '80px', md: '85px', xl: '90px' }}
        >
          {pageHeader.title && (
            <Box mb="24px">
              <Text fontWeight="700" fontSize="3xl" color={textColor} lineHeight="1.1">
                {pageHeader.title}
              </Text>
              {pageHeader.description && (
                <Text fontSize="sm" color={subtitleColor} mt="4px">
                  {pageHeader.description}
                </Text>
              )}
              <Breadcrumb separator=">" mt="5px" spacing="8px">
                <BreadcrumbItem>
                  <BreadcrumbLink href="/zentinelle/agents/" fontSize="xs" color={subtitleColor} _hover={{ color: textColor }}>
                    HOME
                  </BreadcrumbLink>
                </BreadcrumbItem>
                {getActiveParent(routes, pathname) && getActiveParent(routes, pathname) !== getActiveRoute(routes, pathname) && (
                  <BreadcrumbItem>
                    <BreadcrumbLink href="#" fontSize="xs" color={subtitleColor} _hover={{ color: textColor }}>
                      {getActiveParent(routes, pathname)}
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                )}
                <BreadcrumbItem isCurrentPage>
                  <BreadcrumbLink href="#" fontSize="xs" color={subtitleColor} fontWeight="500">
                    {getActiveRoute(routes, pathname)}
                  </BreadcrumbLink>
                </BreadcrumbItem>
              </Breadcrumb>
            </Box>
          )}
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
                  <PageHeaderProvider>
                    <SessionInitializer>
                      <ApolloWrapper>
                        <OrganizationProvider>
                          <ZentinelleLayout>{children}</ZentinelleLayout>
                        </OrganizationProvider>
                      </ApolloWrapper>
                    </SessionInitializer>
                  </PageHeaderProvider>
                </AuthProvider>
              </ChakraProvider>
            </ConfiguratorContext.Provider>
          </UserProvider>
        </NoSSR>
      </body>
    </html>
  );
}
