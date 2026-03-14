'use client';

import {
  VStack,
  Text,
  Icon,
  useColorModeValue,
  Button,
  HStack,
} from '@chakra-ui/react';
import { MdRocket } from 'react-icons/md';
import Card from 'components/card/Card';
import { useRouter } from 'next/navigation';

export default function OnboardingWizard() {
  const cardBg = useColorModeValue('white', 'navy.800');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const subtleText = useColorModeValue('gray.500', 'gray.400');
  const router = useRouter();

  return (
    <Card p="40px" bg={cardBg}>
      <VStack spacing="24px">
        <Icon as={MdRocket} boxSize="64px" color="brand.500" />
        <Text fontSize="2xl" fontWeight="700" color={textColor}>
          Welcome to Zentinelle
        </Text>
        <Text fontSize="md" color={subtleText} textAlign="center" maxW="500px">
          The guided onboarding wizard is being updated. In the meantime, you can
          set up your deployment and agent endpoints using the platform settings.
        </Text>
        <HStack spacing="16px" pt="16px">
          <Button
            colorScheme="brand"
            onClick={() => router.push('/zentinelle/agents')}
          >
            View Deployments
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push('/zentinelle/agents')}
          >
            Manage Agents
          </Button>
        </HStack>
      </VStack>
    </Card>
  );
}
