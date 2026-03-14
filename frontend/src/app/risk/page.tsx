'use client';

import {
  Box,
  Heading,
  Text,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  HStack,
  Icon,
  useColorModeValue,
} from '@chakra-ui/react';
import {
  MdShield,
  MdBugReport,
  MdWarning,
} from 'react-icons/md';
import RiskRegister from 'components/zentinelle/RiskRegister';
import IncidentManagement from 'components/zentinelle/IncidentManagement';

export default function RiskManagementPage() {
  const textColor = useColorModeValue('secondaryGray.900', 'white');

  return (
    <Box pt={{ base: '130px', md: '80px', xl: '80px' }}>
      {/* Header */}
      <Box mb="24px">
        <Heading size="lg" color={textColor} mb="8px">
          Risk Management
        </Heading>
        <Text fontSize="md" color="gray.500">
          Track AI-specific risks and manage policy violation incidents
        </Text>
      </Box>

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
