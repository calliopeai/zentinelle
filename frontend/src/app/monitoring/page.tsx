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
  MdMonitor,
  MdSecurity,
  MdWarning,
  MdAutoGraph,
  MdNotifications,
} from 'react-icons/md';
import RealTimeMonitor from 'components/zentinelle/RealTimeMonitor';
import ContentScannerDashboard from 'components/zentinelle/ContentScannerDashboard';
import AnomalyDetection from 'components/zentinelle/AnomalyDetection';
import MonitoringDashboard from 'components/zentinelle/MonitoringDashboard';

export default function MonitoringPage() {
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const tabBg = useColorModeValue('white', 'navy.800');

  return (
    <Box pt={{ base: '130px', md: '80px', xl: '80px' }}>
      {/* Header */}
      <Box mb="24px">
        <Heading size="lg" color={textColor} mb="8px">
          Monitoring
        </Heading>
        <Text fontSize="md" color="gray.500">
          Real-time visibility into AI agent activity, content scanning, and anomaly detection
        </Text>
      </Box>

      {/* Tabs */}
      <Tabs variant="enclosed" colorScheme="brand">
        <TabList>
          <Tab>
            <HStack spacing="8px">
              <Icon as={MdMonitor} />
              <Text>Live Activity</Text>
            </HStack>
          </Tab>
          <Tab>
            <HStack spacing="8px">
              <Icon as={MdSecurity} />
              <Text>Content Scanner</Text>
            </HStack>
          </Tab>
          <Tab>
            <HStack spacing="8px">
              <Icon as={MdWarning} />
              <Text>Anomalies</Text>
            </HStack>
          </Tab>
          <Tab>
            <HStack spacing="8px">
              <Icon as={MdNotifications} />
              <Text>Compliance Alerts</Text>
            </HStack>
          </Tab>
        </TabList>

        <TabPanels>
          {/* Live Activity Tab */}
          <TabPanel px="0" pt="20px">
            <RealTimeMonitor />
          </TabPanel>

          {/* Content Scanner Tab */}
          <TabPanel px="0" pt="20px">
            <ContentScannerDashboard />
          </TabPanel>

          {/* Anomalies Tab */}
          <TabPanel px="0" pt="20px">
            <AnomalyDetection />
          </TabPanel>

          {/* Compliance Alerts Tab */}
          <TabPanel px="0" pt="20px">
            <MonitoringDashboard />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Box>
  );
}
