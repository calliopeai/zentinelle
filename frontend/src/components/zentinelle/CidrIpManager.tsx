'use client';

import {
  VStack,
  HStack,
  Text,
  Icon,
  useColorModeValue,
  Button,
  Badge,
  Alert,
  AlertIcon,
  AlertDescription,
  Link,
} from '@chakra-ui/react';
import { MdSecurity, MdEmail, MdOpenInNew } from 'react-icons/md';
import Card from 'components/card/Card';

export default function CidrIpManager() {
  const cardBg = useColorModeValue('white', 'navy.800');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const subtleText = useColorModeValue('gray.500', 'gray.400');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.100');

  return (
    <Card p="20px" bg={cardBg}>
      <VStack spacing="24px" align="stretch">
        <HStack justify="space-between">
          <VStack align="start" spacing="4px">
            <HStack>
              <Icon as={MdSecurity} color="brand.500" boxSize="20px" />
              <Text fontWeight="600" color={textColor}>IP Access Control</Text>
            </HStack>
            <Text fontSize="sm" color={subtleText}>
              Restrict agent network access by IP address
            </Text>
          </VStack>
          <Badge colorScheme="purple">Enterprise</Badge>
        </HStack>

        <Alert status="info" borderRadius="md">
          <AlertIcon />
          <AlertDescription>
            <VStack align="start" spacing="8px">
              <Text fontWeight="500">IP-based access control is available on Enterprise plans</Text>
              <Text fontSize="sm">
                Configure CIDR ranges, single IP addresses, and geo-based restrictions to control
                which networks your AI agents can communicate with.
              </Text>
            </VStack>
          </AlertDescription>
        </Alert>

        <VStack
          p="20px"
          bg={useColorModeValue('gray.50', 'navy.900')}
          borderRadius="md"
          spacing="16px"
        >
          <Text fontSize="sm" fontWeight="600" color={textColor}>Features include:</Text>
          <VStack align="start" spacing="8px" w="100%">
            <HStack>
              <Badge colorScheme="green" variant="subtle">Allow</Badge>
              <Text fontSize="sm" color={subtleText}>Whitelist specific IP ranges (e.g., 10.0.0.0/8)</Text>
            </HStack>
            <HStack>
              <Badge colorScheme="red" variant="subtle">Block</Badge>
              <Text fontSize="sm" color={subtleText}>Block known malicious or unwanted IP ranges</Text>
            </HStack>
            <HStack>
              <Badge colorScheme="blue" variant="subtle">Geo</Badge>
              <Text fontSize="sm" color={subtleText}>Country-based restrictions (GDPR compliance)</Text>
            </HStack>
            <HStack>
              <Badge colorScheme="purple" variant="subtle">VPN</Badge>
              <Text fontSize="sm" color={subtleText}>Require VPN/private network for sensitive operations</Text>
            </HStack>
          </VStack>
        </VStack>

        <HStack justify="center" pt="8px">
          <Button
            leftIcon={<MdEmail />}
            colorScheme="brand"
            variant="outline"
            size="sm"
            as={Link}
            href="mailto:sales@calliope.ai?subject=Enterprise%20IP%20Access%20Control"
            isExternal
          >
            Contact Sales
          </Button>
          <Button
            rightIcon={<MdOpenInNew />}
            variant="ghost"
            size="sm"
            as={Link}
            href="https://calliope.ai/pricing"
            isExternal
          >
            View Plans
          </Button>
        </HStack>
      </VStack>
    </Card>
  );
}
