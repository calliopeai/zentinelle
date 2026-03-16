'use client';

import React, { ReactNode, useState } from 'react';
import 'styles/App.css';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  Box,
  ChakraProvider,
  Portal,
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
import { PageHeaderProvider } from 'contexts/PageHeaderContext';
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
  const breadcrumbColor = useColorModeValue('gray.500', 'secondaryGray.500');
  const breadcrumbActiveColor = useColorModeValue('secondaryGray.900', 'white');

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
            <Box
              position="fixed"
              top={{ base: '100px', md: '104px', xl: '108px' }}
              right={{ base: '12px', md: '30px', lg: '30px', xl: '30px' }}
              w={{
                base: 'calc(100vw - 6%)',
                md: 'calc(100vw - 8%)',
                lg: 'calc(100vw - 6%)',
                xl: 'calc(100vw - 350px)',
                '2xl': 'calc(100vw - 365px)',
              }}
              px={{ sm: '15px', md: '10px' }}
              zIndex={98}
              h="36px"
              display="flex"
              alignItems="center"
            >
              <Breadcrumb separator=">" spacing="8px">
                <BreadcrumbItem>
                  <BreadcrumbLink
                    href="/zentinelle/agents/"
                    fontSize="sm"
                    color={breadcrumbColor}
                    _hover={{ color: breadcrumbActiveColor }}
                  >
                    HOME
                  </BreadcrumbLink>
                </BreadcrumbItem>
                {getActiveParent(routes, pathname) &&
                  getActiveParent(routes, pathname) !== getActiveRoute(routes, pathname) && (
                  <BreadcrumbItem>
                    <BreadcrumbLink
                      href="#"
                      fontSize="sm"
                      color={breadcrumbColor}
                      _hover={{ color: breadcrumbActiveColor }}
                    >
                      {getActiveParent(routes, pathname)}
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                )}
                <BreadcrumbItem isCurrentPage>
                  <BreadcrumbLink href="#" fontSize="sm" color={breadcrumbActiveColor} fontWeight="500">
                    {getActiveRoute(routes, pathname)}
                  </BreadcrumbLink>
                </BreadcrumbItem>
              </Breadcrumb>
            </Box>
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
