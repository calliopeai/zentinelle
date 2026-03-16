'use client';

import { Box } from '@chakra-ui/react';
import { usePageHeader } from 'contexts/PageHeaderContext';
import RetentionPolicies from 'components/zentinelle/RetentionPolicies';

export default function RetentionPage() {
  usePageHeader('Data Retention & Legal Holds', 'Manage data lifecycle, retention periods, and compliance holds');

  return (
    <Box>
      <RetentionPolicies />
    </Box>
  );
}
