'use client';

import {
  Box,
  Flex,
  Heading,
  Text,
  useColorModeValue,
} from '@chakra-ui/react';
import RetentionPolicies from 'components/zentinelle/RetentionPolicies';

export default function RetentionPage() {
  const textColor = useColorModeValue('secondaryGray.900', 'white');

  return (
    <Box pt={{ base: '130px', md: '80px', xl: '80px' }}>
      {/* Header */}
      <Flex justify="space-between" align="center" mb="20px">
        <Box>
          <Heading size="lg" color={textColor}>
            Data Retention & Legal Holds
          </Heading>
          <Text fontSize="sm" color="secondaryGray.600">
            Manage data lifecycle, retention periods, and compliance holds
          </Text>
        </Box>
      </Flex>

      <RetentionPolicies />
    </Box>
  );
}
