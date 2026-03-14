'use client';

import {
  Box,
  VStack,
  HStack,
  SimpleGrid,
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
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  IconButton,
  Tooltip,
  useColorModeValue,
  useToast,
  Divider,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Spinner,
  Alert,
  AlertIcon,
} from '@chakra-ui/react';
import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import {
  MdSearch,
  MdDownload,
  MdVisibility,
  MdCheckCircle,
  MdBlock,
  MdWarning,
  MdInfo,
  MdPerson,
  MdSmartToy,
  MdContentCopy,
  MdGavel,
  MdHistory,
} from 'react-icons/md';
import Card from 'components/card/Card';
import { GET_AUDIT_LOGS, EXPORT_AUDIT_LOGS } from 'graphql/audit';

interface AuditActor {
  id: string;
  email: string | null;
  name: string | null;
  type: string;
}

interface AuditChange {
  field: string;
  oldValue: string | null;
  newValue: string | null;
}

interface AuditEntry {
  id: string;
  timestamp: string;
  actor: AuditActor | null;
  action: string;
  resource: string;
  resourceId: string | null;
  resourceName: string | null;
  status: string;
  ipAddress: string | null;
  userAgent: string | null;
  details: Record<string, unknown> | null;
  changes: AuditChange[] | null;
}

interface AuditTrailProps {
  onExport?: (format: 'csv' | 'json' | 'pdf') => void;
}

function formatDateTime(isoString: string): string {
  return new Date(isoString).toLocaleString();
}

function getPeriodDates(period: string): { startDate: Date; endDate: Date } {
  const endDate = new Date();
  const startDate = new Date();

  switch (period) {
    case '1h':
      startDate.setHours(startDate.getHours() - 1);
      break;
    case '24h':
      startDate.setDate(startDate.getDate() - 1);
      break;
    case '7d':
      startDate.setDate(startDate.getDate() - 7);
      break;
    case '30d':
      startDate.setDate(startDate.getDate() - 30);
      break;
    default:
      startDate.setDate(startDate.getDate() - 7);
  }

  return { startDate, endDate };
}

export default function AuditTrail({ onExport }: AuditTrailProps) {
  const cardBg = useColorModeValue('white', 'navy.800');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.200');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const subtleText = useColorModeValue('gray.500', 'gray.400');
  const hoverBg = useColorModeValue('gray.50', 'whiteAlpha.100');
  const codeBg = useColorModeValue('gray.50', 'whiteAlpha.100');
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [resourceFilter, setResourceFilter] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [dateRange, setDateRange] = useState('7d');
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);

  const { isOpen, onOpen, onClose } = useDisclosure();
  const { startDate, endDate } = getPeriodDates(dateRange);

  // Fetch audit logs
  const { data, loading, error, refetch } = useQuery(GET_AUDIT_LOGS, {
    variables: {
      search: search || undefined,
      action: actionFilter || undefined,
      resource: resourceFilter || undefined,
      actor: actorFilter || undefined,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      first: 100,
    },
    pollInterval: 30000,
  });

  // Export mutation
  const [exportAuditLogs, { loading: exportLoading }] = useMutation(EXPORT_AUDIT_LOGS);

  // Transform data
  const entries: AuditEntry[] = useMemo(() => {
    if (!data?.auditLogs?.edges) return [];
    return data.auditLogs.edges.map((edge: { node: AuditEntry }) => edge.node);
  }, [data]);

  const totalCount = data?.auditLogs?.totalCount || 0;

  // Calculate stats
  const stats = useMemo(() => {
    const total = entries.length;
    const allowed = entries.filter((e) => e.status === 'success' || e.action === 'allow').length;
    const blocked = entries.filter((e) => e.status === 'blocked' || e.action === 'block' || e.action === 'deny').length;
    const warned = entries.filter((e) => e.status === 'warning' || e.action === 'warn').length;
    return { total, allowed, blocked, warned };
  }, [entries]);

  const handleViewDetails = (entry: AuditEntry) => {
    setSelectedEntry(entry);
    onOpen();
  };

  const handleExport = async (format: 'csv' | 'json' | 'pdf') => {
    if (onExport) {
      onExport(format);
      return;
    }

    try {
      const { data: exportData } = await exportAuditLogs({
        variables: {
          format,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      });

      if (exportData?.exportAuditLogs?.downloadUrl) {
        window.open(exportData.exportAuditLogs.downloadUrl, '_blank');
        toast({
          title: 'Export started',
          description: 'Your download will begin shortly',
          status: 'success',
          duration: 3000,
        });
      } else if (exportData?.exportAuditLogs?.errors?.length) {
        toast({
          title: 'Export failed',
          description: exportData.exportAuditLogs.errors.join(', '),
          status: 'error',
          duration: 5000,
        });
      }
    } catch (err) {
      toast({
        title: `Exporting as ${format.toUpperCase()}`,
        description: `${entries.length} audit entries will be exported`,
        status: 'info',
        duration: 3000,
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied to clipboard', status: 'info', duration: 2000 });
  };

  // Action colors based on status/action
  const getActionColor = (entry: AuditEntry): string => {
    if (entry.status === 'blocked' || entry.action === 'block' || entry.action === 'deny') return 'red';
    if (entry.status === 'warning' || entry.action === 'warn') return 'orange';
    if (entry.action === 'create' || entry.action === 'allow') return 'green';
    if (entry.action === 'update' || entry.action === 'modify') return 'blue';
    if (entry.action === 'delete') return 'red';
    return 'gray';
  };

  const getActionIcon = (entry: AuditEntry) => {
    if (entry.status === 'blocked' || entry.action === 'block' || entry.action === 'deny') return MdBlock;
    if (entry.status === 'warning' || entry.action === 'warn') return MdWarning;
    if (entry.action === 'create' || entry.action === 'allow') return MdCheckCircle;
    if (entry.action === 'update' || entry.action === 'modify') return MdInfo;
    return MdHistory;
  };

  if (error) {
    return (
      <Alert status="error">
        <AlertIcon />
        Failed to load audit logs: {error.message}
      </Alert>
    );
  }

  return (
    <Box>
      {/* Stats */}
      <SimpleGrid columns={{ base: 2, md: 4 }} spacing="16px" mb="20px">
        <Card p="20px" bg={cardBg}>
          <Stat>
            <StatLabel color={subtleText}>Total Events</StatLabel>
            <StatNumber color={textColor}>{totalCount.toLocaleString()}</StatNumber>
            <StatHelpText>Last {dateRange}</StatHelpText>
          </Stat>
        </Card>
        <Card p="20px" bg={cardBg}>
          <Stat>
            <StatLabel color={subtleText}>Allowed</StatLabel>
            <StatNumber color="green.500">{stats.allowed.toLocaleString()}</StatNumber>
            <StatHelpText>{stats.total > 0 ? ((stats.allowed / stats.total) * 100).toFixed(1) : 0}%</StatHelpText>
          </Stat>
        </Card>
        <Card p="20px" bg={cardBg}>
          <Stat>
            <StatLabel color={subtleText}>Blocked</StatLabel>
            <StatNumber color="red.500">{stats.blocked.toLocaleString()}</StatNumber>
            <StatHelpText>{stats.total > 0 ? ((stats.blocked / stats.total) * 100).toFixed(1) : 0}%</StatHelpText>
          </Stat>
        </Card>
        <Card p="20px" bg={cardBg}>
          <Stat>
            <StatLabel color={subtleText}>Warnings</StatLabel>
            <StatNumber color="orange.500">{stats.warned.toLocaleString()}</StatNumber>
            <StatHelpText>{stats.total > 0 ? ((stats.warned / stats.total) * 100).toFixed(1) : 0}%</StatHelpText>
          </Stat>
        </Card>
      </SimpleGrid>

      {/* Filters */}
      <Card p="16px" bg={cardBg} mb="20px">
        <HStack spacing="12px" flexWrap="wrap">
          <InputGroup maxW="250px">
            <InputLeftElement>
              <Icon as={MdSearch} color="gray.400" />
            </InputLeftElement>
            <Input
              placeholder="Search audit trail..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              size="sm"
            />
          </InputGroup>
          <Select
            placeholder="All Actions"
            maxW="140px"
            size="sm"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          >
            <option value="create">Create</option>
            <option value="update">Update</option>
            <option value="delete">Delete</option>
            <option value="allow">Allow</option>
            <option value="block">Block</option>
            <option value="warn">Warn</option>
          </Select>
          <Select
            placeholder="All Resources"
            maxW="150px"
            size="sm"
            value={resourceFilter}
            onChange={(e) => setResourceFilter(e.target.value)}
          >
            <option value="policy">Policy</option>
            <option value="endpoint">Endpoint</option>
            <option value="deployment">Deployment</option>
            <option value="user">User</option>
            <option value="interaction">Interaction</option>
          </Select>
          <Select
            value={dateRange}
            maxW="130px"
            size="sm"
            onChange={(e) => setDateRange(e.target.value)}
          >
            <option value="1h">Last Hour</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </Select>
          <Menu>
            <MenuButton
              as={Button}
              size="sm"
              leftIcon={<MdDownload />}
              variant="outline"
              isLoading={exportLoading}
            >
              Export
            </MenuButton>
            <MenuList>
              <MenuItem onClick={() => handleExport('csv')}>Export as CSV</MenuItem>
              <MenuItem onClick={() => handleExport('json')}>Export as JSON</MenuItem>
              <MenuItem onClick={() => handleExport('pdf')}>Export as PDF</MenuItem>
            </MenuList>
          </Menu>
        </HStack>
      </Card>

      {/* Audit Table */}
      <Card p="0" bg={cardBg} overflow="hidden">
        {loading && entries.length === 0 ? (
          <Box p="40px" textAlign="center">
            <Spinner size="lg" color="brand.500" />
            <Text mt="16px" color="gray.500">Loading audit logs...</Text>
          </Box>
        ) : entries.length === 0 ? (
          <Box p="40px" textAlign="center">
            <Text color="gray.500">No audit entries found</Text>
            <Text fontSize="sm" color="gray.400" mt="8px">
              Audit events will appear here as actions are performed
            </Text>
          </Box>
        ) : (
          <Box overflowX="auto">
            <Table size="sm">
              <Thead>
                <Tr>
                  <Th borderColor={borderColor}>Timestamp</Th>
                  <Th borderColor={borderColor}>Action</Th>
                  <Th borderColor={borderColor}>Resource</Th>
                  <Th borderColor={borderColor}>Actor</Th>
                  <Th borderColor={borderColor}>Target</Th>
                  <Th borderColor={borderColor}>Status</Th>
                  <Th borderColor={borderColor}>Details</Th>
                </Tr>
              </Thead>
              <Tbody>
                {entries.slice(0, 100).map((entry) => (
                  <Tr key={entry.id} _hover={{ bg: hoverBg }}>
                    <Td borderColor={borderColor}>
                      <Text fontSize="xs" fontFamily="mono">
                        {formatDateTime(entry.timestamp)}
                      </Text>
                    </Td>
                    <Td borderColor={borderColor}>
                      <Badge
                        colorScheme={getActionColor(entry)}
                        fontSize="10px"
                        display="flex"
                        alignItems="center"
                        gap="4px"
                        w="fit-content"
                      >
                        <Icon as={getActionIcon(entry)} boxSize="12px" />
                        {entry.action}
                      </Badge>
                    </Td>
                    <Td borderColor={borderColor}>
                      <Badge variant="subtle" fontSize="10px">
                        {entry.resource}
                      </Badge>
                    </Td>
                    <Td borderColor={borderColor}>
                      <HStack spacing="4px">
                        <Icon
                          as={entry.actor?.type === 'agent' || entry.actor?.type === 'system' ? MdSmartToy : MdPerson}
                          color={entry.actor?.type === 'agent' || entry.actor?.type === 'system' ? 'purple.500' : 'blue.500'}
                          boxSize="14px"
                        />
                        <Text fontSize="xs">
                          {entry.actor?.name || entry.actor?.email || 'System'}
                        </Text>
                      </HStack>
                    </Td>
                    <Td borderColor={borderColor}>
                      <Tooltip label={entry.resourceId || 'N/A'}>
                        <Text fontSize="xs" noOfLines={1}>
                          {entry.resourceName || entry.resourceId || '-'}
                        </Text>
                      </Tooltip>
                    </Td>
                    <Td borderColor={borderColor}>
                      <Badge
                        colorScheme={entry.status === 'success' ? 'green' : entry.status === 'blocked' ? 'red' : 'gray'}
                        fontSize="10px"
                      >
                        {entry.status}
                      </Badge>
                    </Td>
                    <Td borderColor={borderColor}>
                      <IconButton
                        aria-label="View details"
                        icon={<MdVisibility />}
                        size="xs"
                        variant="ghost"
                        onClick={() => handleViewDetails(entry)}
                      />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>
        )}
        <Box p="12px" borderTop="1px solid" borderColor={borderColor}>
          <Text fontSize="xs" color={subtleText}>
            Showing {Math.min(entries.length, 100)} of {totalCount} entries
          </Text>
        </Box>
      </Card>

      {/* Detail Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <HStack spacing="12px">
              <Icon as={MdGavel} />
              <Text>Audit Entry Details</Text>
              {selectedEntry && (
                <Badge colorScheme={getActionColor(selectedEntry)}>
                  {selectedEntry.action}
                </Badge>
              )}
            </HStack>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {selectedEntry && (
              <Tabs size="sm">
                <TabList>
                  <Tab>Overview</Tab>
                  <Tab>Changes</Tab>
                  <Tab>Raw Data</Tab>
                </TabList>
                <TabPanels>
                  <TabPanel>
                    <VStack align="stretch" spacing="12px">
                      <SimpleGrid columns={2} spacing="12px">
                        <Box>
                          <Text fontSize="xs" color={subtleText} textTransform="uppercase">
                            Timestamp
                          </Text>
                          <Text fontSize="sm">{formatDateTime(selectedEntry.timestamp)}</Text>
                        </Box>
                        <Box>
                          <Text fontSize="xs" color={subtleText} textTransform="uppercase">
                            Resource
                          </Text>
                          <Text fontSize="sm">{selectedEntry.resource}</Text>
                        </Box>
                        <Box>
                          <Text fontSize="xs" color={subtleText} textTransform="uppercase">
                            Actor
                          </Text>
                          <HStack spacing="4px">
                            <Icon
                              as={selectedEntry.actor?.type === 'agent' ? MdSmartToy : MdPerson}
                              color={selectedEntry.actor?.type === 'agent' ? 'purple.500' : 'blue.500'}
                            />
                            <Text fontSize="sm">
                              {selectedEntry.actor?.name || selectedEntry.actor?.email || 'System'}
                            </Text>
                          </HStack>
                        </Box>
                        <Box>
                          <Text fontSize="xs" color={subtleText} textTransform="uppercase">
                            Target
                          </Text>
                          <Text fontSize="sm">{selectedEntry.resourceName || selectedEntry.resourceId || '-'}</Text>
                        </Box>
                      </SimpleGrid>
                      <Divider />
                      <SimpleGrid columns={2} spacing="12px">
                        <Box>
                          <Text fontSize="xs" color={subtleText} textTransform="uppercase">
                            IP Address
                          </Text>
                          <Text fontSize="sm" fontFamily="mono">{selectedEntry.ipAddress || 'N/A'}</Text>
                        </Box>
                        <Box>
                          <Text fontSize="xs" color={subtleText} textTransform="uppercase">
                            Status
                          </Text>
                          <Badge colorScheme={getActionColor(selectedEntry)}>
                            {selectedEntry.status}
                          </Badge>
                        </Box>
                      </SimpleGrid>
                      {selectedEntry.userAgent && (
                        <Box>
                          <Text fontSize="xs" color={subtleText} textTransform="uppercase">
                            User Agent
                          </Text>
                          <Text fontSize="xs" fontFamily="mono" color={subtleText}>
                            {selectedEntry.userAgent}
                          </Text>
                        </Box>
                      )}
                    </VStack>
                  </TabPanel>
                  <TabPanel>
                    {selectedEntry.changes && selectedEntry.changes.length > 0 ? (
                      <VStack align="stretch" spacing="12px">
                        {selectedEntry.changes.map((change, index) => (
                          <Box key={index} p="12px" bg={codeBg} borderRadius="md">
                            <Text fontSize="sm" fontWeight="500" mb="8px">
                              {change.field}
                            </Text>
                            <SimpleGrid columns={2} spacing="8px">
                              <Box>
                                <Text fontSize="xs" color={subtleText}>Before</Text>
                                <Code fontSize="xs">{change.oldValue || '(empty)'}</Code>
                              </Box>
                              <Box>
                                <Text fontSize="xs" color={subtleText}>After</Text>
                                <Code fontSize="xs">{change.newValue || '(empty)'}</Code>
                              </Box>
                            </SimpleGrid>
                          </Box>
                        ))}
                      </VStack>
                    ) : (
                      <Text color="gray.500" textAlign="center" py="20px">
                        No changes recorded for this entry
                      </Text>
                    )}
                  </TabPanel>
                  <TabPanel>
                    <Box position="relative">
                      <Code
                        display="block"
                        p="12px"
                        borderRadius="md"
                        fontSize="xs"
                        whiteSpace="pre-wrap"
                        bg={codeBg}
                      >
                        {JSON.stringify(selectedEntry, null, 2)}
                      </Code>
                      <IconButton
                        aria-label="Copy"
                        icon={<MdContentCopy />}
                        size="sm"
                        position="absolute"
                        top="8px"
                        right="8px"
                        onClick={() => copyToClipboard(JSON.stringify(selectedEntry, null, 2))}
                      />
                    </Box>
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
