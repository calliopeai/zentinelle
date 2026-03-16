'use client';

import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Icon,
  Button,
  Input,
  InputGroup,
  InputLeftElement,
  Select,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
  Code,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Tooltip,
  Switch,
  FormControl,
  FormLabel,
  Spinner,
  Alert,
  AlertIcon,
  useColorModeValue,
} from '@chakra-ui/react';
import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@apollo/client';
import {
  MdSearch,
  MdRefresh,
  MdWarning,
  MdBlock,
  MdVisibility,
  MdPerson,
  MdSmartToy,
  MdAccessTime,
  MdAttachMoney,
  MdMemory,
} from 'react-icons/md';
import { GET_INTERACTION_LOGS, GET_MONITORING_STATS } from 'graphql/monitoring';

interface Interaction {
  id: string;
  occurredAt: string;
  userIdentifier: string;
  endpointName: string | null;
  interactionType: string;
  interactionTypeDisplay: string;
  aiProvider: string;
  aiModel: string;
  inputContent: string;
  outputContent: string;
  inputTokenCount: number | null;
  outputTokenCount: number | null;
  totalTokens: number | null;
  latencyMs: number | null;
  estimatedCostUsd: string | null;
  hasViolations: boolean;
  violationCount: number;
  wasBlocked: boolean;
  classification: Record<string, unknown> | null;
  isWorkRelated: boolean | null;
  topics: string[];
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString();
}

function formatCost(cost: string | number | null): string {
  if (!cost) return '$0.00';
  const numCost = typeof cost === 'string' ? parseFloat(cost) : cost;
  if (numCost < 0.01) return `$${(numCost * 100).toFixed(2)}¢`;
  return `$${numCost.toFixed(4)}`;
}

export default function RealTimeMonitor() {
  const cardBg = useColorModeValue('white', 'navy.800');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.200');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const hoverBg = useColorModeValue('gray.50', 'whiteAlpha.100');

  const [isLive, setIsLive] = useState(true);
  const [search, setSearch] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [endpointFilter, setEndpointFilter] = useState('');
  const [violationFilter, setViolationFilter] = useState('');
  const [selectedInteraction, setSelectedInteraction] = useState<Interaction | null>(null);

  const { isOpen, onOpen, onClose } = useDisclosure();

  // Fetch interaction logs
  const { data, loading, error, refetch } = useQuery(GET_INTERACTION_LOGS, {
    variables: {
      first: 50,
      hasViolations: violationFilter === 'violations' ? true : violationFilter === 'clean' ? false : undefined,
    },
    pollInterval: isLive ? 5000 : 0,
  });

  // Fetch monitoring stats
  const { data: statsData } = useQuery(GET_MONITORING_STATS, {
    pollInterval: isLive ? 10000 : 0,
  });

  // Transform GraphQL data to component format
  const interactions: Interaction[] = useMemo(() => {
    if (!data?.interactionLogs?.edges) return [];
    return data.interactionLogs.edges.map((edge: { node: Interaction }) => edge.node);
  }, [data]);

  // Get unique values for filters
  const uniqueUsers = useMemo(() => {
    return [...new Set(interactions.map((i) => i.userIdentifier).filter(Boolean))];
  }, [interactions]);

  const uniqueEndpoints = useMemo(() => {
    return [...new Set(interactions.map((i) => i.endpointName).filter(Boolean))] as string[];
  }, [interactions]);

  // Filter interactions client-side
  const filteredInteractions = useMemo(() => {
    return interactions.filter((i) => {
      if (search && !i.inputContent?.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      if (userFilter && i.userIdentifier !== userFilter) return false;
      if (endpointFilter && i.endpointName !== endpointFilter) return false;
      if (violationFilter === 'blocked' && !i.wasBlocked) return false;
      return true;
    });
  }, [interactions, search, userFilter, endpointFilter, violationFilter]);

  // Stats from backend
  const stats = useMemo(() => {
    const monitoringStats = statsData?.monitoringStats;
    if (monitoringStats) {
      return {
        total: monitoringStats.totalInteractions || 0,
        violations: monitoringStats.scansWithViolations || 0,
        blocked: monitoringStats.scansBlocked || 0,
        totalTokens: monitoringStats.totalTokensToday || 0,
        totalCost: monitoringStats.totalCostToday || 0,
        avgLatency: monitoringStats.avgLatencyMs || 0,
      };
    }
    // Fallback to client-side calculation
    const total = filteredInteractions.length;
    const violations = filteredInteractions.filter((i) => i.hasViolations).length;
    const blocked = filteredInteractions.filter((i) => i.wasBlocked).length;
    const totalTokens = filteredInteractions.reduce((sum, i) => sum + (i.totalTokens || 0), 0);
    const totalCost = filteredInteractions.reduce((sum, i) => sum + parseFloat(i.estimatedCostUsd || '0'), 0);
    const avgLatency = total > 0 ? filteredInteractions.reduce((sum, i) => sum + (i.latencyMs || 0), 0) / total : 0;
    return { total, violations, blocked, totalTokens, totalCost, avgLatency };
  }, [statsData, filteredInteractions]);

  const handleViewDetails = (interaction: Interaction) => {
    setSelectedInteraction(interaction);
    onOpen();
  };

  if (error) {
    return (
      <Alert status="error">
        <AlertIcon />
        Failed to load interaction logs: {error.message}
      </Alert>
    );
  }

  return (
    <Box>
      {/* Stats Bar */}
      <HStack
        spacing="24px"
        p="16px"
        bg={cardBg}
        borderRadius="lg"
        border="1px solid"
        borderColor={borderColor}
        mb="16px"
        flexWrap="wrap"
      >
        <HStack spacing="8px">
          <Icon as={MdSmartToy} color="brand.500" />
          <VStack align="start" spacing="0">
            <Text fontSize="lg" fontWeight="700" color={textColor}>
              {stats.total}
            </Text>
            <Text fontSize="xs" color="gray.500">Interactions</Text>
          </VStack>
        </HStack>
        <HStack spacing="8px">
          <Icon as={MdWarning} color={stats.violations > 0 ? 'orange.500' : 'gray.400'} />
          <VStack align="start" spacing="0">
            <Text fontSize="lg" fontWeight="700" color={stats.violations > 0 ? 'orange.500' : textColor}>
              {stats.violations}
            </Text>
            <Text fontSize="xs" color="gray.500">Violations</Text>
          </VStack>
        </HStack>
        <HStack spacing="8px">
          <Icon as={MdBlock} color={stats.blocked > 0 ? 'red.500' : 'gray.400'} />
          <VStack align="start" spacing="0">
            <Text fontSize="lg" fontWeight="700" color={stats.blocked > 0 ? 'red.500' : textColor}>
              {stats.blocked}
            </Text>
            <Text fontSize="xs" color="gray.500">Blocked</Text>
          </VStack>
        </HStack>
        <HStack spacing="8px">
          <Icon as={MdMemory} color="blue.500" />
          <VStack align="start" spacing="0">
            <Text fontSize="lg" fontWeight="700" color={textColor}>
              {(stats.totalTokens / 1000).toFixed(1)}k
            </Text>
            <Text fontSize="xs" color="gray.500">Tokens</Text>
          </VStack>
        </HStack>
        <HStack spacing="8px">
          <Icon as={MdAttachMoney} color="green.500" />
          <VStack align="start" spacing="0">
            <Text fontSize="lg" fontWeight="700" color={textColor}>
              ${stats.totalCost.toFixed(2)}
            </Text>
            <Text fontSize="xs" color="gray.500">Cost</Text>
          </VStack>
        </HStack>
        <HStack spacing="8px">
          <Icon as={MdAccessTime} color="purple.500" />
          <VStack align="start" spacing="0">
            <Text fontSize="lg" fontWeight="700" color={textColor}>
              {stats.avgLatency.toFixed(0)}ms
            </Text>
            <Text fontSize="xs" color="gray.500">Avg Latency</Text>
          </VStack>
        </HStack>
      </HStack>

      {/* Controls */}
      <HStack spacing="12px" mb="16px" flexWrap="wrap">
        <FormControl display="flex" alignItems="center" w="auto">
          <FormLabel htmlFor="live-toggle" mb="0" fontSize="sm">
            Live
          </FormLabel>
          <Switch
            id="live-toggle"
            isChecked={isLive}
            onChange={(e) => setIsLive(e.target.checked)}
            colorScheme="green"
          />
        </FormControl>
        <InputGroup maxW="250px">
          <InputLeftElement>
            <Icon as={MdSearch} color="gray.400" />
          </InputLeftElement>
          <Input
            placeholder="Search content..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            size="sm"
          />
        </InputGroup>
        <Select
          placeholder="All Users"
          maxW="150px"
          size="sm"
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
        >
          {uniqueUsers.map((user) => (
            <option key={user} value={user}>{user}</option>
          ))}
        </Select>
        <Select
          placeholder="All Endpoints"
          maxW="150px"
          size="sm"
          value={endpointFilter}
          onChange={(e) => setEndpointFilter(e.target.value)}
        >
          {uniqueEndpoints.map((ep) => (
            <option key={ep} value={ep}>{ep}</option>
          ))}
        </Select>
        <Select
          placeholder="All Status"
          maxW="140px"
          size="sm"
          value={violationFilter}
          onChange={(e) => setViolationFilter(e.target.value)}
        >
          <option value="clean">Clean</option>
          <option value="violations">Violations</option>
          <option value="blocked">Blocked</option>
        </Select>
        <Button
          size="sm"
          variant="outline"
          leftIcon={<MdRefresh />}
          onClick={() => refetch()}
          isLoading={loading}
        >
          Refresh
        </Button>
      </HStack>

      {/* Interactions Table */}
      <Box
        bg={cardBg}
        borderRadius="lg"
        border="1px solid"
        borderColor={borderColor}
        overflowX="auto"
      >
        {loading && interactions.length === 0 ? (
          <Box p="40px" textAlign="center">
            <Spinner size="lg" color="brand.500" />
            <Text mt="16px" color="gray.500">Loading interactions...</Text>
          </Box>
        ) : interactions.length === 0 ? (
          <Box p="40px" textAlign="center">
            <Text color="gray.500">No interactions recorded yet</Text>
            <Text fontSize="sm" color="gray.400" mt="8px">
              Interactions will appear here as AI requests are processed
            </Text>
          </Box>
        ) : (
          <Table size="sm">
            <Thead>
              <Tr>
                <Th borderColor={borderColor}>Time</Th>
                <Th borderColor={borderColor}>User</Th>
                <Th borderColor={borderColor}>Endpoint</Th>
                <Th borderColor={borderColor}>Model</Th>
                <Th borderColor={borderColor}>Input</Th>
                <Th borderColor={borderColor} isNumeric>Tokens</Th>
                <Th borderColor={borderColor} isNumeric>Latency</Th>
                <Th borderColor={borderColor}>Status</Th>
                <Th borderColor={borderColor}>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {filteredInteractions.slice(0, 50).map((interaction) => (
                <Tr
                  key={interaction.id}
                  _hover={{ bg: hoverBg }}
                  bg={interaction.wasBlocked ? 'red.50' : interaction.hasViolations ? 'orange.50' : undefined}
                >
                  <Td borderColor={borderColor}>
                    <Text fontSize="xs" fontFamily="mono">
                      {formatTime(interaction.occurredAt)}
                    </Text>
                  </Td>
                  <Td borderColor={borderColor}>
                    <HStack spacing="4px">
                      <Icon as={MdPerson} color="gray.400" boxSize="14px" />
                      <Text fontSize="xs">{interaction.userIdentifier || 'anonymous'}</Text>
                    </HStack>
                  </Td>
                  <Td borderColor={borderColor}>
                    <Badge colorScheme="blue" fontSize="10px">
                      {interaction.endpointName || 'N/A'}
                    </Badge>
                  </Td>
                  <Td borderColor={borderColor}>
                    <Text fontSize="xs" color="gray.500">
                      {interaction.aiModel || 'N/A'}
                    </Text>
                  </Td>
                  <Td borderColor={borderColor} maxW="200px">
                    <Tooltip label={interaction.inputContent}>
                      <Text fontSize="xs" noOfLines={1}>
                        {interaction.inputContent || '(empty)'}
                      </Text>
                    </Tooltip>
                  </Td>
                  <Td borderColor={borderColor} isNumeric>
                    <Text fontSize="xs">{interaction.totalTokens || 0}</Text>
                  </Td>
                  <Td borderColor={borderColor} isNumeric>
                    <Text
                      fontSize="xs"
                      color={(interaction.latencyMs || 0) > 2000 ? 'orange.500' : 'gray.500'}
                    >
                      {interaction.latencyMs || 0}ms
                    </Text>
                  </Td>
                  <Td borderColor={borderColor}>
                    {interaction.wasBlocked ? (
                      <Badge colorScheme="red" fontSize="10px">Blocked</Badge>
                    ) : interaction.hasViolations ? (
                      <Badge colorScheme="orange" fontSize="10px">
                        {interaction.violationCount} violation{interaction.violationCount > 1 ? 's' : ''}
                      </Badge>
                    ) : (
                      <Badge colorScheme="green" fontSize="10px">Clean</Badge>
                    )}
                  </Td>
                  <Td borderColor={borderColor}>
                    <Button
                      size="xs"
                      variant="ghost"
                      leftIcon={<MdVisibility />}
                      onClick={() => handleViewDetails(interaction)}
                    >
                      View
                    </Button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Box>

      <Text fontSize="xs" color="gray.500" mt="8px">
        Showing {Math.min(filteredInteractions.length, 50)} of {filteredInteractions.length} interactions
        {isLive && ' • Live updates enabled'}
      </Text>

      {/* Detail Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <HStack spacing="12px">
              <Text>Interaction Details</Text>
              {selectedInteraction?.wasBlocked && (
                <Badge colorScheme="red">Blocked</Badge>
              )}
              {selectedInteraction?.hasViolations && !selectedInteraction?.wasBlocked && (
                <Badge colorScheme="orange">Violations</Badge>
              )}
            </HStack>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {selectedInteraction && (
              <Tabs size="sm">
                <TabList>
                  <Tab>Overview</Tab>
                  <Tab>Input/Output</Tab>
                  <Tab>Metadata</Tab>
                </TabList>
                <TabPanels>
                  <TabPanel>
                    <VStack align="stretch" spacing="12px">
                      <HStack justify="space-between">
                        <Text fontSize="sm" color="gray.500">User</Text>
                        <Text fontSize="sm">{selectedInteraction.userIdentifier || 'anonymous'}</Text>
                      </HStack>
                      <HStack justify="space-between">
                        <Text fontSize="sm" color="gray.500">Endpoint</Text>
                        <Badge>{selectedInteraction.endpointName || 'N/A'}</Badge>
                      </HStack>
                      <HStack justify="space-between">
                        <Text fontSize="sm" color="gray.500">Model</Text>
                        <Text fontSize="sm">{selectedInteraction.aiProvider} / {selectedInteraction.aiModel}</Text>
                      </HStack>
                      <HStack justify="space-between">
                        <Text fontSize="sm" color="gray.500">Tokens</Text>
                        <Text fontSize="sm">{selectedInteraction.inputTokenCount || 0} in / {selectedInteraction.outputTokenCount || 0} out</Text>
                      </HStack>
                      <HStack justify="space-between">
                        <Text fontSize="sm" color="gray.500">Cost</Text>
                        <Text fontSize="sm">{formatCost(selectedInteraction.estimatedCostUsd)}</Text>
                      </HStack>
                      <HStack justify="space-between">
                        <Text fontSize="sm" color="gray.500">Latency</Text>
                        <Text fontSize="sm">{selectedInteraction.latencyMs || 0}ms</Text>
                      </HStack>
                      <HStack justify="space-between">
                        <Text fontSize="sm" color="gray.500">Classification</Text>
                        <Badge colorScheme={selectedInteraction.isWorkRelated ? 'blue' : 'purple'}>
                          {selectedInteraction.isWorkRelated ? 'work' : selectedInteraction.isWorkRelated === false ? 'personal' : 'unknown'}
                        </Badge>
                      </HStack>
                    </VStack>
                  </TabPanel>
                  <TabPanel>
                    <VStack align="stretch" spacing="16px">
                      <Box>
                        <Text fontSize="sm" fontWeight="500" mb="8px">Input</Text>
                        <Code display="block" p="12px" borderRadius="md" fontSize="xs" whiteSpace="pre-wrap">
                          {selectedInteraction.inputContent || '(empty)'}
                        </Code>
                      </Box>
                      <Box>
                        <Text fontSize="sm" fontWeight="500" mb="8px">Output</Text>
                        <Code display="block" p="12px" borderRadius="md" fontSize="xs" whiteSpace="pre-wrap">
                          {selectedInteraction.outputContent || '(empty)'}
                        </Code>
                      </Box>
                    </VStack>
                  </TabPanel>
                  <TabPanel>
                    <Code display="block" p="12px" borderRadius="md" fontSize="xs" whiteSpace="pre-wrap">
                      {JSON.stringify(selectedInteraction, null, 2)}
                    </Code>
                  </TabPanel>
                </TabPanels>
              </Tabs>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={onClose}>Close</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
