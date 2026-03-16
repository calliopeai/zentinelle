'use client';

import {
  Box,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  HStack,
  Icon,
  Text,
} from '@chakra-ui/react';
import {
  MdShield,
  MdBugReport,
} from 'react-icons/md';
import { usePageHeader } from 'contexts/PageHeaderContext';
import RiskRegister from 'components/zentinelle/RiskRegister';
import IncidentManagement from 'components/zentinelle/IncidentManagement';

export default function RiskManagementPage() {
  usePageHeader('Risk Management', 'Track AI-specific risks and manage policy violation incidents');

  return (
    <Box>
      {/* Tabs */}
      <Tabs variant="enclosed" colorScheme="brand">
        <TabList>
          <Tab>
            <HStack spacing="8px">
              <Icon as={MdShield} />
              <Text>Risk Register</Text>
            </HStack>
          </Tab>
          <Tab>
            <HStack spacing="8px">
              <Icon as={MdBugReport} />
              <Text>Incidents</Text>
            </HStack>
          </Tab>
        </TabList>

        <TabPanels>
          {/* Risk Register Tab */}
          <TabPanel px="0" pt="20px">
            <RiskRegister />
          </TabPanel>

          {/* Incidents Tab */}
          <TabPanel px="0" pt="20px">
            <IncidentManagement />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Box>
  );
}
