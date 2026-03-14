'use client';

import {
  Box,
  Button,
  Code,
  Flex,
  Heading,
  Icon,
  Text,
  useColorModeValue,
  useToast,
  VStack,
  Alert,
  AlertIcon,
  Spinner,
  HStack,
} from '@chakra-ui/react';
import { useState, useEffect } from 'react';
import { MdContentCopy, MdRefresh, MdBugReport, MdDownload } from 'react-icons/md';
import Card from 'components/card/Card';

interface SessionDebugInfo {
  user: {
    email: string;
    name: string;
    sub: string;
  };
  session: {
    accessTokenExpiresAt: number;
  };
  cookies: {
    appSession: string | null;
    allCookieNames: string[];
  };
  debug: {
    timestamp: string;
    domain: string;
  };
}

export default function DebugPage() {
  const [sessionInfo, setSessionInfo] = useState<SessionDebugInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const toast = useToast();
  const textColor = useColorModeValue('gray.700', 'white');
  const bgCard = useColorModeValue('white', 'navy.700');
  const codeBg = useColorModeValue('gray.100', 'navy.900');

  const fetchSessionInfo = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/zentinelle/api/auth/debug');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch session info');
      }
      const data = await res.json();
      setSessionInfo(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessionInfo();
  }, []);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: `${label} copied`,
      status: 'success',
      duration: 2000,
    });
  };

  const downloadSession = () => {
    if (!sessionInfo?.cookies.appSession) {
      toast({
        title: 'No session cookie',
        status: 'error',
        duration: 3000,
      });
      return;
    }
    const sessionData = [
      {
        name: 'appSession',
        value: sessionInfo.cookies.appSession,
        domain: '.softinfra.net',
        path: '/',
        httpOnly: true,
        secure: true,
      },
    ];
    const blob = new Blob([JSON.stringify(sessionData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'calliope-session-zentinelle.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({
      title: 'Session file downloaded',
      description: 'Save to /tmp/calliope-session-zentinelle.json for playwright testing',
      status: 'success',
      duration: 5000,
    });
  };

  return (
    <Box pt={{ base: '130px', md: '80px', xl: '80px' }}>
      <Flex mb="20px" justify="space-between" align="center">
        <Box>
          <Heading size="lg" color={textColor}>
            <Icon as={MdBugReport} mr="2" />
            Session Debug: Zentinelle
          </Heading>
          <Text color="gray.500" fontSize="sm">
            Session info for testing and debugging (Zentinelle)
          </Text>
        </Box>
        <Button
          leftIcon={<Icon as={MdRefresh} />}
          onClick={fetchSessionInfo}
          isLoading={loading}
        >
          Refresh
        </Button>
      </Flex>

      {error && (
        <Alert status="error" mb="20px" borderRadius="md">
          <AlertIcon />
          {error}
        </Alert>
      )}

      {loading && !sessionInfo ? (
        <Flex justify="center" py="40px">
          <Spinner size="lg" color="brand.500" />
        </Flex>
      ) : sessionInfo ? (
        <VStack spacing="20px" align="stretch">
          {/* User Info */}
          <Card p="20px" bg={bgCard}>
            <Heading size="md" mb="15px" color={textColor}>
              User Info
            </Heading>
            <VStack align="stretch" spacing="10px">
              <Flex justify="space-between">
                <Text fontWeight="600">Email:</Text>
                <Text>{sessionInfo.user.email}</Text>
              </Flex>
              <Flex justify="space-between">
                <Text fontWeight="600">Name:</Text>
                <Text>{sessionInfo.user.name}</Text>
              </Flex>
              <Flex justify="space-between">
                <Text fontWeight="600">Token Expires:</Text>
                <Text>
                  {sessionInfo.session.accessTokenExpiresAt
                    ? new Date(sessionInfo.session.accessTokenExpiresAt * 1000).toLocaleString()
                    : 'N/A'}
                </Text>
              </Flex>
            </VStack>
          </Card>

          {/* Session Cookie */}
          <Card p="20px" bg={bgCard}>
            <Flex justify="space-between" align="center" mb="15px">
              <Heading size="md" color={textColor}>
                Session Cookie
              </Heading>
              {sessionInfo.cookies.appSession && (
                <HStack>
                  <Button
                    size="sm"
                    leftIcon={<Icon as={MdContentCopy} />}
                    onClick={() => copyToClipboard(sessionInfo.cookies.appSession!, 'Session cookie')}
                  >
                    Copy
                  </Button>
                  <Button
                    size="sm"
                    colorScheme="brand"
                    leftIcon={<Icon as={MdDownload} />}
                    onClick={downloadSession}
                  >
                    Download
                  </Button>
                </HStack>
              )}
            </Flex>
            <Text fontSize="sm" color="gray.500" mb="10px">
              Use this cookie for automated testing with playwright
            </Text>
            {sessionInfo.cookies.appSession ? (
              <Box
                bg={codeBg}
                p="15px"
                borderRadius="md"
                maxH="200px"
                overflowY="auto"
              >
                <Code
                  fontSize="xs"
                  whiteSpace="pre-wrap"
                  wordBreak="break-all"
                  display="block"
                  bg="transparent"
                >
                  {sessionInfo.cookies.appSession}
                </Code>
              </Box>
            ) : (
              <Text color="red.500">No session cookie found</Text>
            )}
          </Card>

          {/* Debug Info */}
          <Card p="20px" bg={bgCard}>
            <Heading size="md" mb="15px" color={textColor}>
              Debug Info
            </Heading>
            <VStack align="stretch" spacing="10px">
              <Flex justify="space-between">
                <Text fontWeight="600">Timestamp:</Text>
                <Text>{sessionInfo.debug.timestamp}</Text>
              </Flex>
              <Flex justify="space-between">
                <Text fontWeight="600">Domain:</Text>
                <Text>{sessionInfo.debug.domain}</Text>
              </Flex>
              <Flex justify="space-between">
                <Text fontWeight="600">Cookies:</Text>
                <Text>{sessionInfo.cookies.allCookieNames.join(', ')}</Text>
              </Flex>
            </VStack>
          </Card>
        </VStack>
      ) : null}
    </Box>
  );
}
