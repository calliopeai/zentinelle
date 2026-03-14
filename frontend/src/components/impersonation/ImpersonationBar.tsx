'use client';

import {
  Box,
  Button,
  Flex,
  Text,
  useToast,
  Icon,
  Spinner,
} from '@chakra-ui/react';
import { useQuery, useMutation } from '@apollo/client';
import { MdExitToApp, MdPerson } from 'react-icons/md';
import {
  GET_IMPERSONATION_STATUS,
  STOP_IMPERSONATION,
} from 'graphql/impersonation';

/**
 * Impersonation bar that appears at the top of the screen when an admin
 * is impersonating another user/partner.
 */
export default function ImpersonationBar() {
  const toast = useToast();

  const { data, loading } = useQuery(GET_IMPERSONATION_STATUS, {
    pollInterval: 30000,
  });

  const [stopImpersonation, { loading: stopping }] = useMutation(
    STOP_IMPERSONATION,
    {
      refetchQueries: [{ query: GET_IMPERSONATION_STATUS }],
      onCompleted: (data) => {
        if (data.stopImpersonation.success) {
          toast({
            title: 'Impersonation Ended',
            description: 'You are now viewing as yourself.',
            status: 'success',
            duration: 3000,
          });
          window.location.reload();
        } else {
          toast({
            title: 'Error',
            description:
              data.stopImpersonation.errors?.[0] ||
              'Failed to stop impersonation',
            status: 'error',
            duration: 5000,
          });
        }
      },
    }
  );

  const status = data?.impersonationStatus;

  if (loading || !status?.isImpersonating) {
    return null;
  }

  return (
    <Box
      position="fixed"
      top="0"
      left="0"
      right="0"
      zIndex="10000"
      bg="orange.500"
      color="white"
      py="2"
      px="4"
    >
      <Flex align="center" justify="center" gap="4">
        <Icon as={MdPerson} boxSize="5" />
        <Text fontWeight="semibold" fontSize="sm">
          Impersonating: {status.effectiveUserEmail}
        </Text>
        <Text fontSize="xs" opacity="0.9">
          (logged in as {status.realUserEmail})
        </Text>
        <Button
          size="sm"
          colorScheme="whiteAlpha"
          leftIcon={stopping ? <Spinner size="xs" /> : <Icon as={MdExitToApp} />}
          onClick={() => stopImpersonation()}
          isDisabled={stopping}
          ml="4"
        >
          Stop Impersonating
        </Button>
      </Flex>
    </Box>
  );
}
