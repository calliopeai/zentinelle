'use client';

import {
  Box,
  Button,
  Flex,
  Icon,
  Input,
  InputGroup,
  InputLeftElement,
  Select,
  SimpleGrid,
  Spinner,
  Stat,
  StatLabel,
  StatNumber,
  Text,
  useColorModeValue,
  Badge,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  useToast,
  HStack,
  VStack,
  Code,
  Tooltip,
} from '@chakra-ui/react';
import { useQuery, useMutation } from '@apollo/client';
import { useState } from 'react';
import { MdSearch, MdRefresh, MdDownload, MdVisibility, MdPerson, MdSmartToy } from 'react-icons/md';
import Card from 'components/card/Card';
import { GET_AUDIT_LOGS, GET_AUDIT_ANALYTICS, EXPORT_AUDIT_LOGS } from 'graphql/audit';
import { usePageHeader } from 'contexts/PageHeaderContext';

interface Actor {
  id: string;
  email: string;
  name: string;
  type: string;
}

interface Change {
  field: string;
  oldValue: string;
  newValue: string;
}

interface AuditLog {
  id: string;
  timestamp: string;
  actor: Actor;
  action: string;
  resource: string;
  resourceId: string;
  resourceName: string;
  status: string;
  ipAddress: string;
  userAgent: string;
  details: string;
  changes: Change[];
}

const ACTIONS = [
  { value: 'create', label: 'Create' },
  { value: 'update', label: 'Update' },
  { value: 'delete', label: 'Delete' },
  { value: 'login', label: 'Login' },
  { value: 'logout', label: 'Logout' },
  { value: 'view', label: 'View' },
  { value: 'export', label: 'Export' },
  { value: 'invite', label: 'Invite' },
  { value: 'revoke', label: 'Revoke' },
];

const RESOURCES = [
  { value: 'user', label: 'User' },
  { value: 'agent', label: 'Agent' },
  { value: 'policy', label: 'Policy' },
  { value: 'api_key', label: 'API Key' },
  { value: 'deployment', label: 'Deployment' },
  { value: 'subscription', label: 'Subscription' },
];

function getActionColor(action: string): string {
  switch (action?.toLowerCase()) {
    case 'create':
      return 'green';
    case 'update':
      return 'blue';
    case 'delete':
      return 'red';
    case 'login':
    case 'logout':
      return 'purple';
    case 'view':
    case 'export':
      return 'gray';
    case 'invite':
      return 'cyan';
    case 'revoke':
      return 'orange';
    default:
      return 'gray';
  }
}

function getStatusColor(status: string): string {
  switch (status?.toLowerCase()) {
    case 'success':
      return 'green';
    case 'failure':
    case 'failed':
      return 'red';
    case 'pending':
      return 'blue';
    default:
      return 'gray';
  }
}

function formatDateTime(dateString: string): string {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDateShort(dateString: string): string {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AuditLogsPage() {
  usePageHeader('Audit Logs', 'Track all activities and changes in your organization');
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [resourceFilter, setResourceFilter] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const { isOpen, onOpen, onClose } = useDisclosure();

  const cardBg = useColorModeValue('white', 'navy.800');
  const statBg = useColorModeValue('gray.50', 'navy.700');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.100');
  const codeBg = useColorModeValue('gray.100', 'whiteAlpha.100');

  const { data: analyticsData } = useQuery(GET_AUDIT_ANALYTICS, {
    variables: { days: 7 },
    fetchPolicy: 'cache-and-network',
  });

  const { data, loading, error, refetch, fetchMore } = useQuery(GET_AUDIT_LOGS, {
    variables: {
      search: search || undefined,
      action: actionFilter || undefined,
      resource: resourceFilter || undefined,
      first: 50,
    },
    fetchPolicy: 'cache-and-network',
  });

  const [exportLogs, { loading: exporting }] = useMutation(EXPORT_AUDIT_LOGS, {
    onCompleted: (result) => {
      if (result.exportAuditLogs?.downloadUrl) {
        window.open(result.exportAuditLogs.downloadUrl, '_blank');
        toast({ title: 'Export started', status: 'success' });
      } else {
        toast({ title: 'Export failed', description: result.exportAuditLogs?.errors?.join(', '), status: 'error' });
      }
    },
  });

  const logs: AuditLog[] = data?.auditLogs?.edges?.map((edge: { node: AuditLog }) => edge.node) || [];
  const totalCount = data?.auditLogs?.totalCount || 0;
  const hasNextPage = data?.auditLogs?.pageInfo?.hasNextPage || false;

  const handleViewDetails = (log: AuditLog) => {
    setSelectedLog(log);
    onOpen();
  };

  const handleExport = () => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    exportLogs({
      variables: {
        format: 'csv',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    });
  };

  const handleLoadMore = () => {
    if (hasNextPage && data?.auditLogs?.pageInfo?.endCursor) {
      fetchMore({
        variables: {
          after: data.auditLogs.pageInfo.endCursor,
        },
      });
    }
  };

  return (
    <Box pt={{ base: '130px', md: '80px', xl: '80px' }}>
      <Flex justify="flex-end" mb="20px">
        <HStack spacing="12px">
          <Button
            variant="outline"
            leftIcon={<Icon as={MdDownload} />}
            onClick={handleExport}
            isLoading={exporting}
          >
            Export
          </Button>
          <Button variant="outline" leftIcon={<Icon as={MdRefresh} />} onClick={() => refetch()} isLoading={loading}>
            Refresh
          </Button>
        </HStack>
      </Flex>

      {/* Analytics Panel (ClickHouse — hidden when unavailable) */}
      {analyticsData?.auditAnalytics && (
        <SimpleGrid columns={{ base: 1, md: 3 }} spacing="16px" mb="24px">
          <Card p="20px" bg={cardBg}>
            <Stat>
              <StatLabel color="secondaryGray.600" fontSize="sm">Total Events (7d)</StatLabel>
              <StatNumber color={textColor} fontSize="2xl">
                {analyticsData.auditAnalytics.byType
                  .reduce((sum: number, t: { count: number }) => sum + t.count, 0)
                  .toLocaleString()}
              </StatNumber>
            </Stat>
          </Card>
          <Card p="20px" bg={cardBg}>
            <Stat>
              <StatLabel color="secondaryGray.600" fontSize="sm">Top Event Type</StatLabel>
              <StatNumber color={textColor} fontSize="xl" isTruncated>
                {analyticsData.auditAnalytics.byType[0]?.eventType || '—'}
              </StatNumber>
            </Stat>
          </Card>
          <Card p="20px" bg={cardBg}>
            <Stat>
              <StatLabel color="secondaryGray.600" fontSize="sm">Most Active Agent</StatLabel>
              <StatNumber color={textColor} fontSize="xl" isTruncated>
                {analyticsData.auditAnalytics.topAgents[0]?.agentId || '—'}
              </StatNumber>
            </Stat>
          </Card>
        </SimpleGrid>
      )}

      {/* Filters */}
      <Card p="20px" mb="24px" bg={cardBg}>
        <Flex gap="16px" flexWrap="wrap">
          <InputGroup maxW="300px">
            <InputLeftElement>
              <Icon as={MdSearch} color="gray.400" />
            </InputLeftElement>
            <Input placeholder="Search logs..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </InputGroup>
          <Select placeholder="All Actions" maxW="180px" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
            {ACTIONS.map((action) => (
              <option key={action.value} value={action.value}>
                {action.label}
              </option>
            ))}
          </Select>
          <Select placeholder="All Resources" maxW="180px" value={resourceFilter} onChange={(e) => setResourceFilter(e.target.value)}>
            {RESOURCES.map((resource) => (
              <option key={resource.value} value={resource.value}>
                {resource.label}
              </option>
            ))}
          </Select>
          {totalCount > 0 && (
            <Text fontSize="sm" color="gray.500" alignSelf="center">
              {totalCount.toLocaleString()} total logs
            </Text>
          )}
        </Flex>
      </Card>

      {/* Loading / Error States */}
      {loading && logs.length === 0 && (
        <Flex justify="center" py="40px">
          <Spinner size="xl" color="brand.500" />
        </Flex>
      )}

      {error && (
        <Card p="20px" bg={cardBg}>
          <Text color="red.500">Error loading audit logs: {error.message}</Text>
        </Card>
      )}

      {/* Audit Logs Table */}
      {logs.length > 0 && (
        <Card p="0" bg={cardBg}>
          <TableContainer>
            <Table variant="simple">
              <Thead>
                <Tr>
                  <Th borderColor={borderColor} color="secondaryGray.600">Timestamp</Th>
                  <Th borderColor={borderColor} color="secondaryGray.600">Actor</Th>
                  <Th borderColor={borderColor} color="secondaryGray.600">Action</Th>
                  <Th borderColor={borderColor} color="secondaryGray.600">Resource</Th>
                  <Th borderColor={borderColor} color="secondaryGray.600">Status</Th>
                  <Th borderColor={borderColor} color="secondaryGray.600">IP Address</Th>
                  <Th borderColor={borderColor} color="secondaryGray.600">Details</Th>
                </Tr>
              </Thead>
              <Tbody>
                {logs.map((log) => (
                  <Tr key={log.id}>
                    <Td borderColor={borderColor}>
                      <Tooltip label={formatDateTime(log.timestamp)}>
                        <Text fontSize="sm">{formatDateShort(log.timestamp)}</Text>
                      </Tooltip>
                    </Td>
                    <Td borderColor={borderColor}>
                      <HStack spacing="8px">
                        <Icon
                          as={log.actor?.type === 'agent' ? MdSmartToy : MdPerson}
                          color={log.actor?.type === 'agent' ? 'purple.500' : 'blue.500'}
                        />
                        <Box>
                          <Text fontWeight="500" fontSize="sm">{log.actor?.name || log.actor?.email || 'System'}</Text>
                          {log.actor?.email && log.actor?.name && (
                            <Text fontSize="xs" color="gray.500">{log.actor.email}</Text>
                          )}
                        </Box>
                      </HStack>
                    </Td>
                    <Td borderColor={borderColor}>
                      <Badge colorScheme={getActionColor(log.action)}>{log.action}</Badge>
                    </Td>
                    <Td borderColor={borderColor}>
                      <Box>
                        <Text fontSize="sm" textTransform="capitalize">{log.resource}</Text>
                        {log.resourceName && (
                          <Text fontSize="xs" color="gray.500">{log.resourceName}</Text>
                        )}
                      </Box>
                    </Td>
                    <Td borderColor={borderColor}>
                      <Badge colorScheme={getStatusColor(log.status)}>{log.status}</Badge>
                    </Td>
                    <Td borderColor={borderColor}>
                      <Code fontSize="xs" bg={codeBg}>{log.ipAddress || 'N/A'}</Code>
                    </Td>
                    <Td borderColor={borderColor}>
                      <Button
                        size="xs"
                        variant="ghost"
                        leftIcon={<Icon as={MdVisibility} />}
                        onClick={() => handleViewDetails(log)}
                      >
                        View
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
          {hasNextPage && (
            <Flex justify="center" p="16px">
              <Button variant="outline" onClick={handleLoadMore} isLoading={loading}>
                Load More
              </Button>
            </Flex>
          )}
        </Card>
      )}

      {/* Empty State */}
      {!loading && logs.length === 0 && !error && (
        <Card p="40px" bg={cardBg} textAlign="center">
          <Text fontSize="lg" color={textColor} mb="8px">
            No audit logs found
          </Text>
          <Text color="gray.500">
            Audit logs will appear here as activities occur
          </Text>
        </Card>
      )}

      {/* Details Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Audit Log Details</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb="24px">
            {selectedLog && (
              <VStack spacing="16px" align="stretch">
                <HStack justify="space-between">
                  <Text fontWeight="600">Timestamp</Text>
                  <Text>{formatDateTime(selectedLog.timestamp)}</Text>
                </HStack>
                <HStack justify="space-between">
                  <Text fontWeight="600">Actor</Text>
                  <Box textAlign="right">
                    <Text>{selectedLog.actor?.name || selectedLog.actor?.email || 'System'}</Text>
                    {selectedLog.actor?.type && (
                      <Badge size="sm">{selectedLog.actor.type}</Badge>
                    )}
                  </Box>
                </HStack>
                <HStack justify="space-between">
                  <Text fontWeight="600">Action</Text>
                  <Badge colorScheme={getActionColor(selectedLog.action)}>{selectedLog.action}</Badge>
                </HStack>
                <HStack justify="space-between">
                  <Text fontWeight="600">Resource</Text>
                  <Box textAlign="right">
                    <Text textTransform="capitalize">{selectedLog.resource}</Text>
                    {selectedLog.resourceName && (
                      <Text fontSize="sm" color="gray.500">{selectedLog.resourceName}</Text>
                    )}
                  </Box>
                </HStack>
                <HStack justify="space-between">
                  <Text fontWeight="600">Status</Text>
                  <Badge colorScheme={getStatusColor(selectedLog.status)}>{selectedLog.status}</Badge>
                </HStack>
                <HStack justify="space-between">
                  <Text fontWeight="600">IP Address</Text>
                  <Code bg={codeBg}>{selectedLog.ipAddress || 'N/A'}</Code>
                </HStack>
                {selectedLog.userAgent && (
                  <Box>
                    <Text fontWeight="600" mb="4px">User Agent</Text>
                    <Code fontSize="xs" bg={codeBg} p="8px" display="block" whiteSpace="pre-wrap">
                      {selectedLog.userAgent}
                    </Code>
                  </Box>
                )}
                {selectedLog.details && (
                  <Box>
                    <Text fontWeight="600" mb="4px">Details</Text>
                    <Code fontSize="xs" bg={codeBg} p="8px" display="block" whiteSpace="pre-wrap">
                      {selectedLog.details}
                    </Code>
                  </Box>
                )}
                {selectedLog.changes && selectedLog.changes.length > 0 && (
                  <Box>
                    <Text fontWeight="600" mb="8px">Changes</Text>
                    <TableContainer>
                      <Table variant="simple" size="sm">
                        <Thead>
                          <Tr>
                            <Th borderColor={borderColor}>Field</Th>
                            <Th borderColor={borderColor}>Old Value</Th>
                            <Th borderColor={borderColor}>New Value</Th>
                          </Tr>
                        </Thead>
                        <Tbody>
                          {selectedLog.changes.map((change, idx) => (
                            <Tr key={idx}>
                              <Td borderColor={borderColor}>{change.field}</Td>
                              <Td borderColor={borderColor}>
                                <Code fontSize="xs" bg={codeBg}>{change.oldValue || '-'}</Code>
                              </Td>
                              <Td borderColor={borderColor}>
                                <Code fontSize="xs" bg={codeBg}>{change.newValue || '-'}</Code>
                              </Td>
                            </Tr>
                          ))}
                        </Tbody>
                      </Table>
                    </TableContainer>
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
