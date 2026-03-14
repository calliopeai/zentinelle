'use client';

import {
  Box,
  Flex,
  Heading,
  Text,
  useColorModeValue,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Icon,
} from '@chakra-ui/react';
import { MdLan, MdPublic } from 'react-icons/md';
import CidrIpManager from 'components/zentinelle/CidrIpManager';
import DomainPatternBuilder from 'components/zentinelle/DomainPatternBuilder';

export default function NetworkPoliciesPage() {
  const textColor = useColorModeValue('secondaryGray.900', 'white');

  return (
    <Box pt={{ base: '130px', md: '80px', xl: '80px' }}>
      {/* Header */}
      <Flex justify="space-between" align="center" mb="20px">
        <Box>
          <Heading size="lg" color={textColor}>
            Network Policies
          </Heading>
          <Text fontSize="sm" color="secondaryGray.600">
            Manage IP access rules and domain allowlists/blocklists
          </Text>
        </Box>
      </Flex>

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
