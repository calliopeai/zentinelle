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
  useColorModeValue,
} from '@chakra-ui/react';
import {
  MdMonitor,
  MdSecurity,
  MdWarning,
  MdAutoGraph,
  MdNotifications,
} from 'react-icons/md';
import { usePageHeader } from 'contexts/PageHeaderContext';
import RealTimeMonitor from 'components/zentinelle/RealTimeMonitor';
import ContentScannerDashboard from 'components/zentinelle/ContentScannerDashboard';
import AnomalyDetection from 'components/zentinelle/AnomalyDetection';
import MonitoringDashboard from 'components/zentinelle/MonitoringDashboard';

export default function MonitoringPage() {
  usePageHeader('Monitoring', 'Real-time visibility into AI agent activity, content scanning, and anomaly detection');
  const tabBg = useColorModeValue('white', 'navy.800');

  return (
    <Box pt={{ base: '130px', md: '80px', xl: '80px' }}>
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
