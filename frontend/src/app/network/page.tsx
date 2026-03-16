'use client';

import {
  Box,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Icon,
} from '@chakra-ui/react';
import { MdLan, MdPublic } from 'react-icons/md';
import { usePageHeader } from 'contexts/PageHeaderContext';
import CidrIpManager from 'components/zentinelle/CidrIpManager';
import DomainPatternBuilder from 'components/zentinelle/DomainPatternBuilder';

export default function NetworkPoliciesPage() {
  usePageHeader('Network Policies', 'Manage IP access rules and domain allowlists/blocklists');

  return (
    <Box pt={{ base: '130px', md: '80px', xl: '80px' }}>
      <Tabs variant="enclosed" colorScheme="brand">
        <TabList>
          <Tab>
            <Icon as={MdLan} mr={2} />
            IP Access Rules
          </Tab>
          <Tab>
            <Icon as={MdPublic} mr={2} />
            Domain Patterns
          </Tab>
        </TabList>

        <TabPanels>
          <TabPanel px={0}>
            <CidrIpManager />
          </TabPanel>
          <TabPanel px={0}>
            <DomainPatternBuilder />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Box>
  );
}
