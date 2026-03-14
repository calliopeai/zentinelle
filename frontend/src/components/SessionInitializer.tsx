'use client';

import { useBackendSession } from 'hooks/useBackendSession';
import { ReactNode } from 'react';
import { Box, Spinner, Text, VStack } from '@chakra-ui/react';

/**
 * Component that initializes the backend Django session.
 * Shows loading state while exchanging Auth0 token for Django session.
 */
export function SessionInitializer({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, error } = useBackendSession();

  if (isLoading) {
    return (
      <Box
        minH="100vh"
        display="flex"
        alignItems="center"
        justifyContent="center"
        bg="navy.900"
      >
        <VStack spacing={4}>
          <Spinner size="xl" color="brand.500" thickness="4px" />
          <Text color="white">Loading Zentinelle...</Text>
        </VStack>
      </Box>
    );
  }

  if (error) {
    return (
      <Box
        minH="100vh"
        display="flex"
        alignItems="center"
        justifyContent="center"
        bg="navy.900"
      >
        <VStack spacing={4}>
          <Text color="red.400" fontSize="xl">
            Session Error
          </Text>
          <Text color="gray.400">{error.message}</Text>
          <Text color="gray.500" fontSize="sm">
            Please try refreshing the page or logging in again.
          </Text>
        </VStack>
      </Box>
    );
  }

  return <>{children}</>;
}
