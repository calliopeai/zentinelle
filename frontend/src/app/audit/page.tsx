'use client';

import { useState, useMemo } from 'react';
import {
  Box,
  Text,
  Heading,
  Flex,
  useColorModeValue,
  HStack,
  VStack,
  Button,
  IconButton,
  Input,
  Select,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  Spinner,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  SimpleGrid,
  Collapse,
  Code,
  Tooltip,
  InputGroup,
  InputLeftElement,
  useToast,
} from '@chakra-ui/react';
import {
  MdSearch,
  MdRefresh,
  MdFilterList,
  MdExpandMore,
  MdExpandLess,
  MdDownload,
  MdInfo,
  MdPerson,
  MdVpnKey,
  MdEdit,
  MdDelete,
  MdAdd,
  MdLock,
  MdVisibility,
  MdHistory,
} from 'react-icons/md';
import { useQuery, useMutation } from '@apollo/client';
import Card from 'components/card/Card';
import { GET_AUDIT_LOGS, GET_AUDIT_LOG, EXPORT_AUDIT_LOGS } from 'graphql/audit';
import { useOrganization } from 'contexts/OrganizationContext';

interface AuditActor {
  id: string;
  email: string;
  name: string;
  type: string;
}

interface AuditChange {
  field: string;
  oldValue: string | null;
  newValue: string | null;
}

interface AuditLog {
  id: string;
  timestamp: string;
  actor: AuditActor | null;
  action: string;
  resource: string;
  resourceId: string;
  resourceName: string;
  status: string;
  ipAddress: string;
  userAgent: string;
  details: string;
  changes: AuditChange[];
  metadata?: Record<string, any>;
}

const ACTION_OPTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'create', label: 'Create' },
  { value: 'update', label: 'Update' },
  { value: 'delete', label: 'Delete' },
  { value: 'access', label: 'Access' },
  { value: 'login', label: 'Login' },
  { value: 'logout', label: 'Logout' },
  { value: 'rotate_key', label: 'Rotate Key' },
  { value: 'suspend', label: 'Suspend' },
  { value: 'activate', label: 'Activate' },
];

const RESOURCE_OPTIONS = [
  { value: '', label: 'All Resources' },
  { value: 'policy', label: 'Policy' },
  { value: 'endpoint', label: 'Endpoint' },
  { value: 'deployment', label: 'Deployment' },
{ value: 'user', label: 'User' },
  { value: 'ai_key', label: 'AI Key' },
  { value: 'retention_policy', label: 'Retention Policy' },
  { value: 'legal_hold', label: 'Legal Hold' },
];

export default function AuditLogsPage() {
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const subtleText = useColorModeValue('gray.500', 'gray.400');
  const bgCard = useColorModeValue('white', 'navy.700');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.100');
  const hoverBg = useColorModeValue('gray.50', 'whiteAlpha.100');
  const codeBg = useColorModeValue('gray.100', 'navy.900');
  const toast = useToast();
  const { organization } = useOrganization();

  // Filters
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [resourceFilter, setResourceFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Detail view
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const detailModal = useDisclosure();

  // Pagination state
  const [loadingMore, setLoadingMore] = useState(false);

  // Query
  const { data, loading, refetch, fetchMore } = useQuery(GET_AUDIT_LOGS, {
    variables: {
      search: search || undefined,
      action: actionFilter || undefined,
      resource: resourceFilter || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      first: 50,
    },
    skip: !organization?.id,
  });

  const handleLoadMore = async () => {
    if (!data?.auditLogs?.pageInfo?.hasNextPage || loadingMore) return;

    setLoadingMore(true);
    try {
      await fetchMore({
        variables: {
          after: data.auditLogs.pageInfo.endCursor,
        },
        updateQuery: (prev, { fetchMoreResult }) => {
          if (!fetchMoreResult) return prev;
          return {
            auditLogs: {
              ...fetchMoreResult.auditLogs,
              edges: [
                ...prev.auditLogs.edges,
                ...fetchMoreResult.auditLogs.edges,
              ],
            },
          };
        },
      });
    } finally {
      setLoadingMore(false);
    }
  };

  // Export mutation
  const [exportLogs, { loading: exporting }] = useMutation(EXPORT_AUDIT_LOGS);

  const logs = useMemo(() => {
    return data?.auditLogs?.edges?.map((e: any) => e.node) || [];
  }, [data]);

  const totalCount = data?.auditLogs?.totalCount || 0;

  // Stats
  const stats = useMemo(() => {
    const today = new Date().toDateString();
    const todayLogs = logs.filter((l: AuditLog) => new Date(l.timestamp).toDateString() === today);
    const actions = logs.reduce((acc: Record<string, number>, log: AuditLog) => {
      acc[log.action] = (acc[log.action] || 0) + 1;
      return acc;
    }, {});
    const uniqueActors = new Set(logs.map((l: AuditLog) => l.actor?.email).filter(Boolean));
    return {
      total: totalCount,
      today: todayLogs.length,
      uniqueActors: uniqueActors.size,
      topAction: Object.entries(actions).sort(([, a], [, b]) => (b as number) - (a as number))[0]?.[0] || '-',
    };
  }, [logs, totalCount]);

  const toggleRowExpand = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleExport = async (format: string) => {
    try {
      const result = await exportLogs({
        variables: {
          format,
          startDate: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          endDate: endDate || new Date().toISOString(),
        },
      });
      if (result.data?.exportAuditLogs?.downloadUrl) {
        window.open(result.data.exportAuditLogs.downloadUrl, '_blank');
        toast({ title: 'Export started', status: 'success', duration: 3000 });
      } else {
        toast({ title: 'Export failed', description: result.data?.exportAuditLogs?.errors?.join(', '), status: 'error', duration: 5000 });
      }
    } catch (error: any) {
      toast({ title: 'Export failed', description: error.message, status: 'error', duration: 5000 });
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'create':
      case 'add':
        return MdAdd;
      case 'update':
      case 'edit':
        return MdEdit;
      case 'delete':
      case 'remove':
        return MdDelete;
      case 'access':
      case 'view':
        return MdVisibility;
      case 'login':
      case 'logout':
        return MdPerson;
      case 'rotate_key':
        return MdVpnKey;
      case 'suspend':
      case 'activate':
        return MdLock;
      default:
        return MdHistory;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'create':
      case 'add':
        return 'green';
      case 'update':
      case 'edit':
        return 'blue';
      case 'delete':
      case 'remove':
        return 'red';
      case 'access':
      case 'view':
        return 'gray';
      case 'login':
        return 'teal';
      case 'logout':
        return 'orange';
      case 'rotate_key':
        return 'purple';
      case 'suspend':
        return 'red';
      case 'activate':
        return 'green';
      default:
        return 'gray';
    }
  };

  const formatTimestamp = (ts: string) => {
    const date = new Date(ts);
    return date.toLocaleString();
  };

  const formatTimeAgo = (ts: string) => {
    const date = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <Box pt={{ base: '130px', md: '80px', xl: '80px' }}>
      <Flex mb="20px" justify="space-between" align="center" flexWrap="wrap" gap="10px">
        <Box>
          <Heading size="lg" color={textColor}>Audit Logs</Heading>
          <Text color={subtleText} fontSize="sm">
            Track all administrative actions and changes in your organization
          </Text>
        </Box>
        <HStack>
          <Menu>
            <MenuButton as={Button} leftIcon={<MdDownload />} size="sm" variant="outline" isLoading={exporting}>
              Export
            </MenuButton>
            <MenuList>
              <MenuItem onClick={() => handleExport('csv')}>Export as CSV</MenuItem>
              <MenuItem onClick={() => handleExport('json')}>Export as JSON</MenuItem>
            </MenuList>
          </Menu>
          <IconButton
            aria-label="Refresh"
            icon={<MdRefresh />}
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
          />
        </HStack>
      </Flex>

      {/* Stats */}
      <SimpleGrid columns={{ base: 2, md: 4 }} spacing="20px" mb="20px">
        <Card p="20px" bg={bgCard}>
          <Stat>
            <StatLabel color={subtleText}>Total Events</StatLabel>
            <StatNumber color={textColor}>{stats.total.toLocaleString()}</StatNumber>
            <StatHelpText color={subtleText}>all time</StatHelpText>
          </Stat>
        </Card>
        <Card p="20px" bg={bgCard}>
          <Stat>
            <StatLabel color={subtleText}>Today</StatLabel>
            <StatNumber color={textColor}>{stats.today}</StatNumber>
            <StatHelpText color="green.500">events</StatHelpText>
          </Stat>
        </Card>
        <Card p="20px" bg={bgCard}>
          <Stat>
            <StatLabel color={subtleText}>Active Users</StatLabel>
            <StatNumber color={textColor}>{stats.uniqueActors}</StatNumber>
            <StatHelpText color={subtleText}>in period</StatHelpText>
          </Stat>
        </Card>
        <Card p="20px" bg={bgCard}>
          <Stat>
            <StatLabel color={subtleText}>Top Action</StatLabel>
            <StatNumber color={textColor} fontSize="xl" textTransform="capitalize">
              {stats.topAction}
            </StatNumber>
            <StatHelpText color={subtleText}>most frequent</StatHelpText>
          </Stat>
        </Card>
      </SimpleGrid>

      {/* Filters & Table */}
      <Card p="20px" bg={bgCard}>
        {/* Search & Filters */}
        <VStack spacing="12px" align="stretch" mb="20px">
          <Flex gap="12px" flexWrap="wrap">
            <InputGroup maxW="300px">
              <InputLeftElement>
                <MdSearch color="gray" />
              </InputLeftElement>
              <Input
                placeholder="Search logs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </InputGroup>
            <Button
              leftIcon={<MdFilterList />}
              variant="outline"
              size="md"
              onClick={() => setShowFilters(!showFilters)}
            >
              Filters
              {(actionFilter || resourceFilter || startDate || endDate) && (
                <Badge ml="8px" colorScheme="brand">
                  {[actionFilter, resourceFilter, startDate, endDate].filter(Boolean).length}
                </Badge>
              )}
            </Button>
          </Flex>

          <Collapse in={showFilters}>
            <Flex gap="12px" flexWrap="wrap" pt="12px">
              <Select
                maxW="180px"
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
              >
                {ACTION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </Select>
              <Select
                maxW="180px"
                value={resourceFilter}
                onChange={(e) => setResourceFilter(e.target.value)}
              >
                {RESOURCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </Select>
              <Input
                type="date"
                maxW="180px"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                placeholder="Start Date"
              />
              <Input
                type="date"
                maxW="180px"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                placeholder="End Date"
              />
              {(actionFilter || resourceFilter || startDate || endDate) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setActionFilter('');
                    setResourceFilter('');
                    setStartDate('');
                    setEndDate('');
                  }}
                >
                  Clear
                </Button>
              )}
            </Flex>
          </Collapse>
        </VStack>

        {/* Table */}
        {loading ? (
          <Flex justify="center" py="40px">
            <Spinner size="lg" color="brand.500" />
          </Flex>
        ) : logs.length === 0 ? (
          <VStack py="40px" spacing="16px">
            <MdHistory size={48} color="gray" />
            <Text color={subtleText}>No audit logs found</Text>
            <Text color={subtleText} fontSize="sm">Try adjusting your filters</Text>
          </VStack>
        ) : (
          <Box overflowX="auto">
            <Table variant="simple" size="sm">
              <Thead>
                <Tr>
                  <Th borderColor={borderColor} w="30px"></Th>
                  <Th borderColor={borderColor}>Timestamp</Th>
                  <Th borderColor={borderColor}>Actor</Th>
                  <Th borderColor={borderColor}>Action</Th>
                  <Th borderColor={borderColor}>Resource</Th>
                  <Th borderColor={borderColor}>Status</Th>
                  <Th borderColor={borderColor}></Th>
                </Tr>
              </Thead>
              <Tbody>
                {logs.map((log: AuditLog) => (
                  <>
                    <Tr key={log.id} _hover={{ bg: hoverBg }} cursor="pointer" onClick={() => toggleRowExpand(log.id)}>
                      <Td borderColor={borderColor}>
                        <IconButton
                          aria-label="Expand"
                          icon={expandedRows.has(log.id) ? <MdExpandLess /> : <MdExpandMore />}
                          variant="ghost"
                          size="xs"
                        />
                      </Td>
                      <Td borderColor={borderColor}>
                        <VStack align="start" spacing="0">
                          <Text fontSize="sm" color={textColor}>{formatTimeAgo(log.timestamp)}</Text>
                          <Text fontSize="xs" color={subtleText}>{formatTimestamp(log.timestamp)}</Text>
                        </VStack>
                      </Td>
                      <Td borderColor={borderColor}>
                        <VStack align="start" spacing="0">
                          <Text fontSize="sm" color={textColor} fontWeight="500">
                            {log.actor?.name || log.actor?.email || 'System'}
                          </Text>
                          {log.actor?.type && (
                            <Badge size="sm" colorScheme={log.actor.type === 'api_key' ? 'purple' : 'gray'}>
                              {log.actor.type}
                            </Badge>
                          )}
                        </VStack>
                      </Td>
                      <Td borderColor={borderColor}>
                        <Badge colorScheme={getActionColor(log.action)} textTransform="capitalize">
                          {log.action.replace('_', ' ')}
                        </Badge>
                      </Td>
                      <Td borderColor={borderColor}>
                        <VStack align="start" spacing="0">
                          <Text fontSize="sm" color={textColor} textTransform="capitalize">
                            {log.resource.replace('_', ' ')}
                          </Text>
                          {log.resourceName && (
                            <Text fontSize="xs" color={subtleText} noOfLines={1}>{log.resourceName}</Text>
                          )}
                        </VStack>
                      </Td>
                      <Td borderColor={borderColor}>
                        <Badge colorScheme={log.status === 'success' ? 'green' : log.status === 'failed' ? 'red' : 'gray'}>
                          {log.status || 'success'}
                        </Badge>
                      </Td>
                      <Td borderColor={borderColor}>
                        <Tooltip label="View details">
                          <IconButton
                            aria-label="View details"
                            icon={<MdInfo />}
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLog(log);
                              detailModal.onOpen();
                            }}
                          />
                        </Tooltip>
                      </Td>
                    </Tr>
                    {expandedRows.has(log.id) && (
                      <Tr key={`${log.id}-expanded`}>
                        <Td colSpan={7} borderColor={borderColor} bg={hoverBg}>
                          <Box p="12px">
                            {log.changes && log.changes.length > 0 ? (
                              <VStack align="start" spacing="8px">
                                <Text fontSize="sm" fontWeight="600" color={textColor}>Changes:</Text>
                                {log.changes.map((change, idx) => (
                                  <HStack key={idx} spacing="12px" fontSize="sm">
                                    <Text color={subtleText} fontWeight="500" minW="100px">{change.field}:</Text>
                                    {change.oldValue && (
                                      <Code colorScheme="red" fontSize="xs">{String(change.oldValue).slice(0, 50)}</Code>
                                    )}
                                    <Text color={subtleText}>→</Text>
                                    <Code colorScheme="green" fontSize="xs">{String(change.newValue).slice(0, 50)}</Code>
                                  </HStack>
                                ))}
                              </VStack>
                            ) : log.details ? (
                              <VStack align="start" spacing="8px">
                                <Text fontSize="sm" fontWeight="600" color={textColor}>Details:</Text>
                                <Code p="8px" bg={codeBg} borderRadius="md" fontSize="xs" w="100%" whiteSpace="pre-wrap">
                                  {log.details}
                                </Code>
                              </VStack>
                            ) : (
                              <Text fontSize="sm" color={subtleText}>No additional details</Text>
                            )}
                            {log.ipAddress && (
                              <HStack mt="8px" fontSize="xs" color={subtleText}>
                                <Text>IP: {log.ipAddress}</Text>
                                {log.userAgent && <Text>• {log.userAgent.slice(0, 50)}...</Text>}
                              </HStack>
                            )}
                          </Box>
                        </Td>
                      </Tr>
                    )}
                  </>
                ))}
              </Tbody>
            </Table>
          </Box>
        )}

        {/* Pagination info */}
        {!loading && logs.length > 0 && (
          <Flex justify="space-between" align="center" mt="16px" pt="16px" borderTop="1px" borderColor={borderColor}>
            <Text fontSize="sm" color={subtleText}>
              Showing {logs.length} of {totalCount} events
            </Text>
            {data?.auditLogs?.pageInfo?.hasNextPage && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleLoadMore}
                isLoading={loadingMore}
                loadingText="Loading..."
              >
                Load More
              </Button>
            )}
          </Flex>
        )}
      </Card>

      {/* Detail Modal */}
      <Modal isOpen={detailModal.isOpen} onClose={detailModal.onClose} size="xl">
        <ModalOverlay />
        <ModalContent bg={bgCard}>
          <ModalHeader color={textColor}>
            <HStack>
              <Badge colorScheme={getActionColor(selectedLog?.action || '')} fontSize="md" textTransform="capitalize">
                {selectedLog?.action?.replace('_', ' ')}
              </Badge>
              <Text>{selectedLog?.resource?.replace('_', ' ')}</Text>
            </HStack>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb="20px">
            {selectedLog && (
              <VStack align="stretch" spacing="16px">
                <SimpleGrid columns={2} spacing="16px">
                  <Box>
                    <Text fontSize="sm" color={subtleText}>Timestamp</Text>
                    <Text color={textColor}>{formatTimestamp(selectedLog.timestamp)}</Text>
                  </Box>
                  <Box>
                    <Text fontSize="sm" color={subtleText}>Status</Text>
                    <Badge colorScheme={selectedLog.status === 'success' ? 'green' : 'red'}>
                      {selectedLog.status || 'success'}
                    </Badge>
                  </Box>
                  <Box>
                    <Text fontSize="sm" color={subtleText}>Actor</Text>
                    <Text color={textColor}>{selectedLog.actor?.name || selectedLog.actor?.email || 'System'}</Text>
                    {selectedLog.actor?.type && (
                      <Badge size="sm">{selectedLog.actor.type}</Badge>
                    )}
                  </Box>
                  <Box>
                    <Text fontSize="sm" color={subtleText}>Resource</Text>
                    <Text color={textColor}>{selectedLog.resourceName || selectedLog.resourceId}</Text>
                  </Box>
                </SimpleGrid>

                {selectedLog.ipAddress && (
                  <Box>
                    <Text fontSize="sm" color={subtleText}>IP Address</Text>
                    <Text color={textColor}>{selectedLog.ipAddress}</Text>
                  </Box>
                )}

                {selectedLog.userAgent && (
                  <Box>
                    <Text fontSize="sm" color={subtleText}>User Agent</Text>
                    <Text color={textColor} fontSize="sm">{selectedLog.userAgent}</Text>
                  </Box>
                )}

                {selectedLog.changes && selectedLog.changes.length > 0 && (
                  <Box>
                    <Text fontSize="sm" color={subtleText} mb="8px">Changes</Text>
                    <VStack align="stretch" spacing="8px">
                      {selectedLog.changes.map((change, idx) => (
                        <Box key={idx} p="12px" bg={codeBg} borderRadius="md">
                          <Text fontWeight="600" fontSize="sm" color={textColor} mb="4px">{change.field}</Text>
                          <HStack spacing="8px" fontSize="sm">
                            <Code colorScheme="red" p="4px">{String(change.oldValue || 'null')}</Code>
                            <Text>→</Text>
                            <Code colorScheme="green" p="4px">{String(change.newValue || 'null')}</Code>
                          </HStack>
                        </Box>
                      ))}
                    </VStack>
                  </Box>
                )}

                {selectedLog.details && (
                  <Box>
                    <Text fontSize="sm" color={subtleText} mb="8px">Details</Text>
                    <Code p="12px" bg={codeBg} borderRadius="md" fontSize="sm" w="100%" display="block" whiteSpace="pre-wrap">
                      {selectedLog.details}
                    </Code>
                  </Box>
                )}

                {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                  <Box>
                    <Text fontSize="sm" color={subtleText} mb="8px">Metadata</Text>
                    <Code p="12px" bg={codeBg} borderRadius="md" fontSize="sm" w="100%" display="block" whiteSpace="pre-wrap">
                      {JSON.stringify(selectedLog.metadata, null, 2)}
                    </Code>
                  </Box>
                )}
              </VStack>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
}
