'use client';

import { useQuery, useMutation } from '@apollo/client';
import {
  Box,
  Flex,
  Text,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Heading,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Icon,
  IconButton,
  useColorModeValue,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
  useToast,
  Textarea,
  Select,
  HStack,
  VStack,
  Progress,
  Tooltip,
  Divider,
  Spinner,
  Alert,
  AlertIcon,
} from '@chakra-ui/react';
import { useState } from 'react';
import {
  MdWarning,
  MdError,
  MdCheckCircle,
  MdInfo,
  MdRefresh,
  MdVisibility,
  MdCheck,
  MdClose,
  MdSchedule,
  MdTrendingUp,
  MdSecurity,
  MdPolicy,
  MdPeople,
} from 'react-icons/md';
import {
  GET_COMPLIANCE_ALERTS,
  ACKNOWLEDGE_COMPLIANCE_ALERT,
  RESOLVE_COMPLIANCE_ALERT,
  DISMISS_COMPLIANCE_ALERT,
} from 'graphql/monitoring';

// Alert types and their display config
const ALERT_TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  compliance_drift: { label: 'Compliance Drift', icon: MdSecurity, color: 'orange' },
  violation_spike: { label: 'Violation Spike', icon: MdTrendingUp, color: 'red' },
  policy_health: { label: 'Policy Health', icon: MdPolicy, color: 'yellow' },
  repeat_violations: { label: 'Repeat Violations', icon: MdPeople, color: 'purple' },
  anomaly_detected: { label: 'Usage Anomaly', icon: MdWarning, color: 'red' },
  single_violation: { label: 'Violation', icon: MdWarning, color: 'orange' },
  repeated_violations: { label: 'Repeated Violations', icon: MdPeople, color: 'purple' },
  threshold_exceeded: { label: 'Threshold Exceeded', icon: MdError, color: 'red' },
  critical_violation: { label: 'Critical Violation', icon: MdError, color: 'red' },
};

const SEVERITY_CONFIG: Record<string, { color: string; icon: React.ElementType }> = {
  critical: { color: 'red', icon: MdError },
  high: { color: 'orange', icon: MdWarning },
  medium: { color: 'yellow', icon: MdInfo },
  low: { color: 'blue', icon: MdInfo },
  info: { color: 'gray', icon: MdInfo },
};

// Monitoring task schedule display (static - these are Celery tasks)
const MONITORING_TASKS = [
  {
    name: 'Compliance Drift Detection',
    description: 'Checks for missing policies, configuration changes, and disabled controls',
    schedule: 'Every hour',
    taskPath: 'zentinelle.tasks.compliance_monitoring.check_compliance_drift',
  },
  {
    name: 'Violation Rate Monitoring',
    description: 'Detects violation spikes and repeat offenders',
    schedule: 'Every 30 minutes',
    taskPath: 'zentinelle.tasks.compliance_monitoring.monitor_violation_rates',
  },
  {
    name: 'Policy Health Checks',
    description: 'Identifies conflicting or orphaned policies',
    schedule: 'Every 6 hours',
    taskPath: 'zentinelle.tasks.compliance_monitoring.check_policy_health',
  },
  {
    name: 'Usage Anomaly Detection',
    description: 'Monitors for unusual request patterns',
    schedule: 'Every hour',
    taskPath: 'zentinelle.tasks.compliance_monitoring.detect_usage_anomalies',
  },
];

interface ComplianceAlert {
  id: string;
  alertType: string;
  alertTypeDisplay: string;
  severity: string;
  severityDisplay: string;
  title: string;
  description: string;
  userIdentifier: string;
  endpointName: string;
  violationCount: number;
  firstViolationAt: string;
  lastViolationAt: string;
  status: string;
  statusDisplay: string;
  acknowledgedByUsername: string;
  acknowledgedAt: string;
  resolvedByUsername: string;
  resolvedAt: string;
  resolutionNotes: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export default function MonitoringDashboard() {
  const cardBg = useColorModeValue('white', 'navy.800');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const secondaryText = useColorModeValue('secondaryGray.600', 'secondaryGray.400');
  const toast = useToast();

  const [selectedAlert, setSelectedAlert] = useState<ComplianceAlert | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [resolutionNotes, setResolutionNotes] = useState('');

  const { isOpen, onOpen, onClose } = useDisclosure();

  // Query compliance alerts
  const { data, loading, error, refetch } = useQuery(GET_COMPLIANCE_ALERTS, {
    variables: {
      status: filterStatus !== 'all' ? filterStatus : undefined,
      severity: filterSeverity !== 'all' ? filterSeverity : undefined,
      first: 100,
    },
    fetchPolicy: 'cache-and-network',
  });

  // Query resolved alerts for history
  const { data: resolvedData } = useQuery(GET_COMPLIANCE_ALERTS, {
    variables: {
      status: 'resolved',
      first: 50,
    },
    fetchPolicy: 'cache-and-network',
  });

  // Mutations
  const [acknowledgeAlert] = useMutation(ACKNOWLEDGE_COMPLIANCE_ALERT, {
    onCompleted: () => {
      toast({ title: 'Alert acknowledged', status: 'success', duration: 2000 });
      refetch();
    },
    onError: (err) => {
      toast({ title: 'Error', description: err.message, status: 'error', duration: 3000 });
    },
  });

  const [resolveAlert] = useMutation(RESOLVE_COMPLIANCE_ALERT, {
    onCompleted: () => {
      toast({ title: 'Alert resolved', status: 'success', duration: 2000 });
      refetch();
      onClose();
    },
    onError: (err) => {
      toast({ title: 'Error', description: err.message, status: 'error', duration: 3000 });
    },
  });

  const [dismissAlert] = useMutation(DISMISS_COMPLIANCE_ALERT, {
    onCompleted: () => {
      toast({ title: 'Alert dismissed', status: 'info', duration: 2000 });
      refetch();
    },
    onError: (err) => {
      toast({ title: 'Error', description: err.message, status: 'error', duration: 3000 });
    },
  });

  // Extract alerts from query
  const alerts: ComplianceAlert[] = data?.complianceAlerts?.edges?.map(
    (edge: { node: ComplianceAlert }) => edge.node
  ) || [];

  const resolvedAlerts: ComplianceAlert[] = resolvedData?.complianceAlerts?.edges?.map(
    (edge: { node: ComplianceAlert }) => edge.node
  ) || [];

  // Stats
  const openAlerts = alerts.filter(a => a.status === 'open').length;
  const criticalAlerts = alerts.filter(a => a.severity === 'critical' || a.severity === 'high').length;
  const acknowledgedAlerts = alerts.filter(a => a.status === 'acknowledged').length;

  const handleViewAlert = (alert: ComplianceAlert) => {
    setSelectedAlert(alert);
    setResolutionNotes(alert.resolutionNotes || '');
    onOpen();
  };

  const handleAcknowledgeAlert = (alertId: string) => {
    acknowledgeAlert({ variables: { alertId } });
  };

  const handleResolveAlert = (alertId: string) => {
    resolveAlert({ variables: { alertId, resolutionNotes } });
  };

  const handleDismissAlert = (alertId: string) => {
    dismissAlert({ variables: { alertId } });
  };

  const formatTimeAgo = (dateString: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  if (error) {
    return (
      <Alert status="error">
        <AlertIcon />
        Error loading alerts: {error.message}
      </Alert>
    );
  }

  return (
    <Box>
      <Tabs variant="enclosed" colorScheme="brand">
        <TabList>
          <Tab>
            <Icon as={MdWarning} mr={2} />
            Active Alerts
            {openAlerts > 0 && (
              <Badge ml={2} colorScheme="red" borderRadius="full">
                {openAlerts}
              </Badge>
            )}
          </Tab>
          <Tab>
            <Icon as={MdSchedule} mr={2} />
            Monitoring Tasks
          </Tab>
          <Tab>
            <Icon as={MdCheckCircle} mr={2} />
            Alert History
          </Tab>
        </TabList>

        <TabPanels>
          {/* Active Alerts Tab */}
          <TabPanel px={0}>
            {/* Stats Cards */}
            <SimpleGrid columns={{ base: 1, md: 4 }} spacing={4} mb={6}>
              <Card bg={cardBg}>
                <CardBody>
                  <Stat>
                    <StatLabel color={secondaryText}>Open Alerts</StatLabel>
                    <StatNumber color={openAlerts > 0 ? 'red.500' : 'green.500'}>
                      {loading ? <Spinner size="sm" /> : openAlerts}
                    </StatNumber>
                    <StatHelpText>Requiring attention</StatHelpText>
                  </Stat>
                </CardBody>
              </Card>

              <Card bg={cardBg}>
                <CardBody>
                  <Stat>
                    <StatLabel color={secondaryText}>Critical/High</StatLabel>
                    <StatNumber color={criticalAlerts > 0 ? 'orange.500' : 'green.500'}>
                      {loading ? <Spinner size="sm" /> : criticalAlerts}
                    </StatNumber>
                    <StatHelpText>High severity alerts</StatHelpText>
                  </Stat>
                </CardBody>
              </Card>

              <Card bg={cardBg}>
                <CardBody>
                  <Stat>
                    <StatLabel color={secondaryText}>Acknowledged</StatLabel>
                    <StatNumber color={textColor}>
                      {loading ? <Spinner size="sm" /> : acknowledgedAlerts}
                    </StatNumber>
                    <StatHelpText>Being investigated</StatHelpText>
                  </Stat>
                </CardBody>
              </Card>

              <Card bg={cardBg}>
                <CardBody>
                  <Stat>
                    <StatLabel color={secondaryText}>Total Alerts</StatLabel>
                    <StatNumber color={textColor}>
                      {loading ? <Spinner size="sm" /> : alerts.length}
                    </StatNumber>
                    <StatHelpText>Matching filters</StatHelpText>
                  </Stat>
                </CardBody>
              </Card>
            </SimpleGrid>

            {/* Filters */}
            <Card bg={cardBg} mb={4}>
              <CardBody py={3}>
                <Flex gap={4} align="center" wrap="wrap">
                  <HStack>
                    <Text fontSize="sm" color={secondaryText}>Status:</Text>
                    <Select
                      size="sm"
                      w="150px"
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                    >
                      <option value="all">All</option>
                      <option value="open">Open</option>
                      <option value="acknowledged">Acknowledged</option>
                      <option value="resolved">Resolved</option>
                      <option value="false_positive">False Positive</option>
                    </Select>
                  </HStack>

                  <HStack>
                    <Text fontSize="sm" color={secondaryText}>Severity:</Text>
                    <Select
                      size="sm"
                      w="150px"
                      value={filterSeverity}
                      onChange={(e) => setFilterSeverity(e.target.value)}
                    >
                      <option value="all">All</option>
                      <option value="critical">Critical</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </Select>
                  </HStack>

                  <Button
                    size="sm"
                    leftIcon={<MdRefresh />}
                    variant="ghost"
                    ml="auto"
                    onClick={() => refetch()}
                    isLoading={loading}
                  >
                    Refresh
                  </Button>
                </Flex>
              </CardBody>
            </Card>

            {/* Alerts Table */}
            <Card bg={cardBg}>
              <CardBody p={0}>
                {loading && alerts.length === 0 ? (
                  <Flex justify="center" py={8}>
                    <Spinner size="lg" />
                  </Flex>
                ) : (
                  <Table variant="simple">
                    <Thead>
                      <Tr>
                        <Th>Type</Th>
                        <Th>Severity</Th>
                        <Th>Alert</Th>
                        <Th>Status</Th>
                        <Th>Time</Th>
                        <Th>Actions</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {alerts.map((alert) => {
                        const typeConfig = ALERT_TYPE_CONFIG[alert.alertType] || {
                          label: alert.alertTypeDisplay || alert.alertType,
                          icon: MdWarning,
                          color: 'gray',
                        };
                        const severityConfig = SEVERITY_CONFIG[alert.severity] || {
                          color: 'gray',
                          icon: MdInfo,
                        };

                        return (
                          <Tr key={alert.id}>
                            <Td>
                              <HStack>
                                <Icon
                                  as={typeConfig.icon}
                                  color={`${typeConfig.color}.500`}
                                />
                                <Text fontSize="sm">{typeConfig.label}</Text>
                              </HStack>
                            </Td>
                            <Td>
                              <Badge colorScheme={severityConfig.color}>
                                {alert.severityDisplay || alert.severity.toUpperCase()}
                              </Badge>
                            </Td>
                            <Td>
                              <Text
                                fontSize="sm"
                                fontWeight="medium"
                                color={textColor}
                                noOfLines={1}
                                maxW="400px"
                              >
                                {alert.title}
                              </Text>
                            </Td>
                            <Td>
                              <Badge
                                colorScheme={
                                  alert.status === 'open'
                                    ? 'red'
                                    : alert.status === 'acknowledged'
                                    ? 'yellow'
                                    : alert.status === 'false_positive'
                                    ? 'gray'
                                    : 'green'
                                }
                              >
                                {alert.statusDisplay || alert.status}
                              </Badge>
                            </Td>
                            <Td>
                              <Text fontSize="sm" color={secondaryText}>
                                {formatTimeAgo(alert.createdAt)}
                              </Text>
                            </Td>
                            <Td>
                              <HStack spacing={1}>
                                <Tooltip label="View Details">
                                  <IconButton
                                    aria-label="View"
                                    icon={<MdVisibility />}
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleViewAlert(alert)}
                                  />
                                </Tooltip>
                                {alert.status === 'open' && (
                                  <Tooltip label="Acknowledge">
                                    <IconButton
                                      aria-label="Acknowledge"
                                      icon={<MdCheck />}
                                      size="sm"
                                      variant="ghost"
                                      colorScheme="green"
                                      onClick={() => handleAcknowledgeAlert(alert.id)}
                                    />
                                  </Tooltip>
                                )}
                                {(alert.status === 'open' || alert.status === 'acknowledged') && (
                                  <Tooltip label="Dismiss as False Positive">
                                    <IconButton
                                      aria-label="Dismiss"
                                      icon={<MdClose />}
                                      size="sm"
                                      variant="ghost"
                                      colorScheme="gray"
                                      onClick={() => handleDismissAlert(alert.id)}
                                    />
                                  </Tooltip>
                                )}
                              </HStack>
                            </Td>
                          </Tr>
                        );
                      })}
                      {alerts.length === 0 && (
                        <Tr>
                          <Td colSpan={6} textAlign="center" py={8}>
                            <Icon as={MdCheckCircle} boxSize={8} color="green.500" mb={2} />
                            <Text color={secondaryText}>No alerts match the current filters</Text>
                          </Td>
                        </Tr>
                      )}
                    </Tbody>
                  </Table>
                )}
              </CardBody>
            </Card>
          </TabPanel>

          {/* Monitoring Tasks Tab */}
          <TabPanel px={0}>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
              {MONITORING_TASKS.map((task, index) => (
                <Card key={index} bg={cardBg}>
                  <CardHeader pb={2}>
                    <Flex justify="space-between" align="start">
                      <Box>
                        <Heading size="sm" color={textColor}>
                          {task.name}
                        </Heading>
                        <Text fontSize="sm" color={secondaryText} mt={1}>
                          {task.description}
                        </Text>
                      </Box>
                      <Badge colorScheme="green">Active</Badge>
                    </Flex>
                  </CardHeader>
                  <CardBody pt={0}>
                    <Divider mb={3} />
                    <VStack align="stretch" spacing={2}>
                      <Flex justify="space-between">
                        <Text fontSize="sm" color={secondaryText}>Schedule:</Text>
                        <Text fontSize="sm" fontWeight="medium">{task.schedule}</Text>
                      </Flex>
                      <Box pt={2}>
                        <Text fontSize="xs" color={secondaryText} mb={1}>
                          Health
                        </Text>
                        <Progress
                          value={100}
                          size="sm"
                          colorScheme="green"
                          borderRadius="full"
                        />
                      </Box>
                    </VStack>
                  </CardBody>
                </Card>
              ))}
            </SimpleGrid>

            <Card bg={cardBg} mt={6}>
              <CardHeader>
                <Heading size="sm" color={textColor}>
                  Celery Beat Schedule
                </Heading>
              </CardHeader>
              <CardBody pt={0}>
                <Table size="sm">
                  <Thead>
                    <Tr>
                      <Th>Task</Th>
                      <Th>Schedule</Th>
                      <Th>Task Path</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {MONITORING_TASKS.map((task, index) => (
                      <Tr key={index}>
                        <Td>{task.name}</Td>
                        <Td>{task.schedule}</Td>
                        <Td fontFamily="mono" fontSize="xs">
                          {task.taskPath}
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </CardBody>
            </Card>
          </TabPanel>

          {/* Alert History Tab */}
          <TabPanel px={0}>
            <Card bg={cardBg}>
              <CardHeader>
                <Heading size="sm" color={textColor}>
                  Resolved Alerts
                </Heading>
              </CardHeader>
              <CardBody pt={0}>
                <Table variant="simple">
                  <Thead>
                    <Tr>
                      <Th>Type</Th>
                      <Th>Alert</Th>
                      <Th>Resolution</Th>
                      <Th>Resolved At</Th>
                      <Th>Resolved By</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {resolvedAlerts.length > 0 ? (
                      resolvedAlerts.map((alert) => {
                        const typeConfig = ALERT_TYPE_CONFIG[alert.alertType] || {
                          label: alert.alertTypeDisplay || alert.alertType,
                          icon: MdWarning,
                          color: 'gray',
                        };
                        return (
                          <Tr key={alert.id}>
                            <Td>
                              <HStack>
                                <Icon
                                  as={typeConfig.icon}
                                  color={`${typeConfig.color}.500`}
                                />
                                <Text fontSize="sm">{typeConfig.label}</Text>
                              </HStack>
                            </Td>
                            <Td>
                              <Text fontSize="sm" noOfLines={1} maxW="300px">
                                {alert.title}
                              </Text>
                            </Td>
                            <Td>
                              <Text fontSize="sm" color={secondaryText} noOfLines={1} maxW="200px">
                                {alert.resolutionNotes || '-'}
                              </Text>
                            </Td>
                            <Td>
                              <Text fontSize="sm" color={secondaryText}>
                                {formatTimeAgo(alert.resolvedAt)}
                              </Text>
                            </Td>
                            <Td>
                              <Text fontSize="sm" color={secondaryText}>
                                {alert.resolvedByUsername || '-'}
                              </Text>
                            </Td>
                          </Tr>
                        );
                      })
                    ) : (
                      <Tr>
                        <Td colSpan={5} textAlign="center" py={8}>
                          <Text color={secondaryText}>No resolved alerts</Text>
                        </Td>
                      </Tr>
                    )}
                  </Tbody>
                </Table>
              </CardBody>
            </Card>
          </TabPanel>
        </TabPanels>
      </Tabs>

      {/* Alert Detail Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size="lg">
        <ModalOverlay />
        <ModalContent bg={cardBg}>
          <ModalHeader>
            Alert Details
            <ModalCloseButton />
          </ModalHeader>
          <ModalBody>
            {selectedAlert && (
              <VStack align="stretch" spacing={4}>
                <Flex justify="space-between" align="center">
                  <HStack>
                    <Icon
                      as={ALERT_TYPE_CONFIG[selectedAlert.alertType]?.icon || MdWarning}
                      color={`${ALERT_TYPE_CONFIG[selectedAlert.alertType]?.color || 'gray'}.500`}
                      boxSize={6}
                    />
                    <Text fontWeight="bold">
                      {ALERT_TYPE_CONFIG[selectedAlert.alertType]?.label || selectedAlert.alertTypeDisplay}
                    </Text>
                  </HStack>
                  <Badge colorScheme={SEVERITY_CONFIG[selectedAlert.severity]?.color || 'gray'}>
                    {selectedAlert.severityDisplay || selectedAlert.severity.toUpperCase()}
                  </Badge>
                </Flex>

                <Box>
                  <Text fontWeight="medium" color={textColor}>
                    {selectedAlert.title}
                  </Text>
                </Box>

                <Box>
                  <Text fontSize="sm" color={secondaryText} fontWeight="medium" mb={1}>
                    Description
                  </Text>
                  <Text fontSize="sm" whiteSpace="pre-wrap">
                    {selectedAlert.description}
                  </Text>
                </Box>

                {selectedAlert.userIdentifier && (
                  <Box>
                    <Text fontSize="sm" color={secondaryText} fontWeight="medium" mb={1}>
                      User
                    </Text>
                    <Text fontSize="sm">{selectedAlert.userIdentifier}</Text>
                  </Box>
                )}

                {selectedAlert.endpointName && (
                  <Box>
                    <Text fontSize="sm" color={secondaryText} fontWeight="medium" mb={1}>
                      Endpoint
                    </Text>
                    <Text fontSize="sm">{selectedAlert.endpointName}</Text>
                  </Box>
                )}

                {selectedAlert.metadata && Object.keys(selectedAlert.metadata).length > 0 && (
                  <Box>
                    <Text fontSize="sm" color={secondaryText} fontWeight="medium" mb={1}>
                      Additional Details
                    </Text>
                    <Box
                      bg={useColorModeValue('gray.50', 'navy.900')}
                      p={3}
                      borderRadius="md"
                      fontFamily="mono"
                      fontSize="xs"
                    >
                      <pre>{JSON.stringify(selectedAlert.metadata, null, 2)}</pre>
                    </Box>
                  </Box>
                )}

                <Divider />

                <Box>
                  <Text fontSize="sm" color={secondaryText} fontWeight="medium" mb={2}>
                    Resolution Notes
                  </Text>
                  <Textarea
                    placeholder="Add notes about the investigation or resolution..."
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    size="sm"
                  />
                </Box>
              </VStack>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onClose}>
              Close
            </Button>
            {selectedAlert?.status === 'open' && (
              <Button
                colorScheme="yellow"
                mr={2}
                onClick={() => selectedAlert && handleAcknowledgeAlert(selectedAlert.id)}
              >
                Acknowledge
              </Button>
            )}
            {(selectedAlert?.status === 'open' || selectedAlert?.status === 'acknowledged') && (
              <Button
                colorScheme="green"
                onClick={() => selectedAlert && handleResolveAlert(selectedAlert.id)}
              >
                Mark Resolved
              </Button>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
