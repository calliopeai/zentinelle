'use client';

import { Box } from '@chakra-ui/react';
import ApiKeyManager from 'components/zentinelle/ApiKeyManager';

export default function ApiKeysPage() {
  return (
    <Box pt={{ base: '130px', md: '80px', xl: '80px' }}>
      <ApiKeyManager />
    </Box>
  );
}
