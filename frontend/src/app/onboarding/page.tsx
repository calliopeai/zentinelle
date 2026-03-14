'use client';

import {
  Box,
  Flex,
  Heading,
  Text,
  useColorModeValue,
  Container,
} from '@chakra-ui/react';
import OnboardingWizard from 'components/zentinelle/OnboardingWizard';

export default function OnboardingPage() {
  const textColor = useColorModeValue('secondaryGray.900', 'white');

  return (
    <Box pt={{ base: '130px', md: '80px', xl: '80px' }}>
      {/* Header */}
      <Flex justify="center" mb="32px">
        <Box textAlign="center">
          <Heading size="lg" color={textColor}>
            Welcome to Zentinelle
          </Heading>
          <Text fontSize="md" color="secondaryGray.600" mt="8px">
            Let's get your AI governance platform set up in just a few minutes
          </Text>
        </Box>
      </Flex>

      <Container maxW="container.lg">
        <OnboardingWizard />
      </Container>
    </Box>
  );
}
