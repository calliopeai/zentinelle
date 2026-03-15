'use client';

import { useQuery, useMutation } from '@apollo/client';
import {
  Box,
  VStack,
  HStack,
  SimpleGrid,
  Text,
  Badge,
  Icon,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Button,
  Select,
  Tooltip,
  useColorModeValue,
  Flex,
  IconButton,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Spinner,
  useToast,
} from '@chakra-ui/react';
import { useState, useMemo } from 'react';
import {
  MdWarning,
  MdTrendingUp,
  MdTrendingDown,
  MdAccessTime,
  MdPerson,
  MdAttachMoney,
  MdSpeed,
  MdMoreVert,
  MdCheckCircle,
  MdError,
  MdAutoGraph,
  MdOutlineAnalytics,
  MdNotificationsActive,
  MdVisibility,
  MdRefresh,
} from 'react-icons/md';
import Card from 'components/card/Card';
import {
  GET_COMPLIANCE_ALERTS,
  GET_MONITORING_STATS,
  ACKNOWLEDGE_COMPLIANCE_ALERT,
  RESOLVE_COMPLIANCE_ALERT,
} from 'graphql/monitoring';

// Alert type configuration
const ALERT_TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  discrepancy: { icon: MdWarning, color: 'orange', label: 'Usage Discrepancy' },
  budget_warning: { icon: MdAttachMoney, color: 'yellow', label: 'Budget Warning' },
  budget_exceeded: { icon: MdAttachMoney, color: 'red', label: 'Budget Exceeded' },
  rate_limit: { icon: MdSpeed, color: 'orange', label: 'Rate Limit Hit' },
  sync_failed: { icon: MdError, color: 'red', label: 'Sync Failed' },
  key_expiring: { icon: MdAccessTime, color: 'yellow', label: 'Key Expiring' },
  payment_failed: { icon: MdAttachMoney, color: 'red', label: 'Payment Failed' },
  license_limit: { icon: MdPerson, color: 'orange', label: 'License Limit' },
  anomaly_detected: { icon: MdAutoGraph, color: 'red', label: 'Anomaly Detected' },
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'red',
  high: 'orange',
  medium: 'yellow',
  low: 'blue',
  info: 'gray',
};

interface UsageAlert {
  id: string;
  alertType: string;
  alertTypeDisplay: string;
  severity: string;
  severityDisplay: string;
  title: string;
  message: string;
  details: Record<string, unknown>;
  thresholdValue: number | null;
  currentValue: number | null;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  acknowledgedByEmail: string | null;
  resolved: boolean;
  resolvedAt: string | null;
  createdAt: string;
}

interface AnomalyDetectionProps {
  onAcknowledge?: (anomalyId: string) => void;
  onResolve?: (anomalyId: string) => void;
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString();
}

function formatTimeAgo(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

export default function AnomalyDetection({
  onAcknowledge,
  onResolve,
}: AnomalyDetectionProps) {
  const cardBg = useColorModeValue('white', 'navy.800');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const subtleText = useColorModeValue('gray.500', 'gray.400');
  const patternBg = useColorModeValue('gray.100', 'whiteAlpha.100');
  const toast = useToast();

  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('active');

  // Query compliance alerts (used for anomaly detection)
  const { data, loading, error, refetch } = useQuery(GET_COMPLIANCE_ALERTS, {
    variables: {
      severity: severityFilter || undefined,
      status: statusFilter === 'active' ? 'open' : statusFilter === 'acknowledged' ? 'acknowledged' : statusFilter === 'resolved' ? 'resolved' : undefined,
      first: 100,
    },
    fetchPolicy: 'cache-and-network',
  });

  // Query monitoring stats for the chart
  const { data: statsData } = useQuery(GET_MONITORING_STATS, {
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
    },
    onError: (err) => {
      toast({ title: 'Error', description: err.message, status: 'error', duration: 3000 });
    },
  });

  // Extract alerts from query - map ComplianceAlert to UsageAlert interface
  const alerts: UsageAlert[] = (data?.complianceAlerts?.edges || []).map(
    (edge: { node: any }) => {
      const node = edge.node;
      return {
        id: node.id,
        alertType: node.alertType,
        alertTypeDisplay: node.alertTypeDisplay,
        severity: node.severity,
        severityDisplay: node.severityDisplay,
        title: node.title,
        message: node.description || '',
        details: node.metadata || {},
        thresholdValue: null,
        currentValue: node.violationCount,
        acknowledged: node.status === 'acknowledged',
        acknowledgedAt: node.acknowledgedAt,
        acknowledgedByEmail: node.acknowledgedByUsername,
        resolved: node.status === 'resolved' || node.status === 'false_positive',
        resolvedAt: node.resolvedAt,
        createdAt: node.createdAt,
      };
    }
  );

  // Sort by severity then timestamp
  const sortedAlerts = useMemo(() => {
    const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    return [...alerts].sort((a, b) => {
      const severityDiff = (severityOrder[a.severity] ?? 5) - (severityOrder[b.severity] ?? 5);
      if (severityDiff !== 0) return severityDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [alerts]);

  // Stats
  const stats = useMemo(() => {
    const active = alerts.filter(a => !a.acknowledged && !a.resolved).length;
    const critical = alerts.filter(a => (a.severity === 'critical' || a.severity === 'high') && !a.resolved).length;
    const warning = alerts.filter(a => a.severity === 'medium' && !a.resolved).length;
    return { total: alerts.length, active, critical, warning };
  }, [alerts]);

  const handleAcknowledge = (id: string) => {
    acknowledgeAlert({ variables: { alertId: id } });
    onAcknowledge?.(id);
  };

  const handleResolve = (id: string) => {
    resolveAlert({ variables: { alertId: id } });
    onResolve?.(id);
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
      {/* Critical Alert Banner */}
      {stats.critical > 0 && (
        <Alert status="error" mb="16px" borderRadius="lg">
          <AlertIcon />
          <Box flex="1">
            <AlertTitle>Critical Anomalies Detected</AlertTitle>
            <AlertDescription>
              {stats.critical} critical alert{stats.critical > 1 ? 's' : ''} require immediate attention
            </AlertDescription>
          </Box>
        </Alert>
      )}

      {/* Stats Overview */}
      <SimpleGrid columns={{ base: 2, md: 4 }} spacing="16px" mb="20px">
        <Card p="20px" bg={cardBg}>
          <HStack spacing="12px">
            <Flex
              w="48px"
              h="48px"
              bg="brand.500"
              borderRadius="12px"
              align="center"
              justify="center"
            >
              <Icon as={MdOutlineAnalytics} color="white" boxSize="24px" />
            </Flex>
            <VStack align="start" spacing="0">
              <Text as="div" fontSize="2xl" fontWeight="700" color={textColor}>
                {loading ? <Spinner size="sm" /> : stats.total}
              </Text>
              <Text fontSize="sm" color={subtleText}>Total Alerts</Text>
            </VStack>
          </HStack>
        </Card>
        <Card p="20px" bg={cardBg}>
          <HStack spacing="12px">
            <Flex
              w="48px"
              h="48px"
              bg="orange.500"
              borderRadius="12px"
              align="center"
              justify="center"
            >
              <Icon as={MdNotificationsActive} color="white" boxSize="24px" />
            </Flex>
            <VStack align="start" spacing="0">
              <Text as="div" fontSize="2xl" fontWeight="700" color="orange.500">
                {loading ? <Spinner size="sm" /> : stats.active}
              </Text>
              <Text fontSize="sm" color={subtleText}>Active</Text>
            </VStack>
          </HStack>
        </Card>
        <Card p="20px" bg={cardBg}>
          <HStack spacing="12px">
            <Flex
              w="48px"
              h="48px"
              bg="red.500"
              borderRadius="12px"
              align="center"
              justify="center"
            >
              <Icon as={MdError} color="white" boxSize="24px" />
            </Flex>
            <VStack align="start" spacing="0">
              <Text as="div" fontSize="2xl" fontWeight="700" color="red.500">
                {loading ? <Spinner size="sm" /> : stats.critical}
              </Text>
              <Text fontSize="sm" color={subtleText}>Critical/High</Text>
            </VStack>
          </HStack>
        </Card>
        <Card p="20px" bg={cardBg}>
          <HStack spacing="12px">
            <Flex
              w="48px"
              h="48px"
              bg="yellow.500"
              borderRadius="12px"
              align="center"
              justify="center"
            >
              <Icon as={MdWarning} color="white" boxSize="24px" />
            </Flex>
            <VStack align="start" spacing="0">
              <Text as="div" fontSize="2xl" fontWeight="700" color="yellow.600">
                {loading ? <Spinner size="sm" /> : stats.warning}
              </Text>
              <Text fontSize="sm" color={subtleText}>Warnings</Text>
            </VStack>
          </HStack>
        </Card>
      </SimpleGrid>

      {/* Stats from Monitoring */}
      {statsData?.monitoringStats && (
        <Card p="20px" bg={cardBg} mb="20px">
          <HStack mb="16px" justify="space-between">
            <HStack>
              <Icon as={MdAutoGraph} color="brand.500" boxSize="20px" />
              <Text fontSize="md" fontWeight="600" color={textColor}>
                System Metrics
              </Text>
            </HStack>
          </HStack>
          <SimpleGrid columns={{ base: 2, md: 4 }} spacing="16px">
            <Box>
              <Text fontSize="xs" color={subtleText}>Interactions Today</Text>
              <Text fontSize="lg" fontWeight="600">{statsData.monitoringStats.interactionsToday?.toLocaleString() || 0}</Text>
            </Box>
            <Box>
              <Text fontSize="xs" color={subtleText}>Scans with Violations</Text>
              <Text fontSize="lg" fontWeight="600">{statsData.monitoringStats.scansWithViolations?.toLocaleString() || 0}</Text>
            </Box>
            <Box>
              <Text fontSize="xs" color={subtleText}>Avg Latency</Text>
              <Text fontSize="lg" fontWeight="600">{statsData.monitoringStats.avgLatencyMs?.toFixed(0) || 0}ms</Text>
            </Box>
            <Box>
              <Text fontSize="xs" color={subtleText}>Cost Today</Text>
              <Text fontSize="lg" fontWeight="600">${statsData.monitoringStats.totalCostToday?.toFixed(2) || '0.00'}</Text>
            </Box>
          </SimpleGrid>
        </Card>
      )}

      {/* Alert List */}
      <Card p="20px" bg={cardBg}>
        <HStack mb="16px" justify="space-between" flexWrap="wrap">
          <Text fontSize="md" fontWeight="600" color={textColor}>
            Usage Alerts
          </Text>
          <HStack spacing="8px">
            <Select
              placeholder="All Severities"
              size="sm"
              maxW="140px"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
            >
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </Select>
            <Select
              size="sm"
              maxW="140px"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="active">Active</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="resolved">Resolved</option>
              <option value="">All</option>
            </Select>
            <Button
              size="sm"
              leftIcon={<MdRefresh />}
              variant="ghost"
              onClick={() => refetch()}
              isLoading={loading}
            >
              Refresh
            </Button>
          </HStack>
        </HStack>

        {loading && alerts.length === 0 ? (
          <Flex justify="center" py={8}>
            <Spinner size="lg" />
          </Flex>
        ) : (
          <VStack align="stretch" spacing="12px">
            {sortedAlerts.map((alert) => {
              const config = ALERT_TYPE_CONFIG[alert.alertType] || {
                icon: MdWarning,
                color: 'gray',
                label: alert.alertTypeDisplay || alert.alertType,
              };
              const severityColor = SEVERITY_COLORS[alert.severity] || 'gray';
              const isActive = !alert.acknowledged && !alert.resolved;

              return (
                <Box
                  key={alert.id}
                  p="16px"
                  bg={patternBg}
                  borderRadius="lg"
                  borderLeft="4px solid"
                  borderLeftColor={`${severityColor}.500`}
                  opacity={alert.resolved ? 0.6 : 1}
                >
                  <HStack justify="space-between" mb="8px">
                    <HStack spacing="12px">
                      <Icon
                        as={config.icon}
                        color={`${config.color}.500`}
                        boxSize="20px"
                      />
                      <Box>
                        <HStack spacing="8px">
                          <Text fontWeight="600" fontSize="sm" color={textColor}>
                            {alert.title}
                          </Text>
                          <Badge colorScheme={severityColor} fontSize="10px">
                            {alert.severityDisplay || alert.severity}
                          </Badge>
                          {alert.acknowledged && !alert.resolved && (
                            <Badge colorScheme="gray" fontSize="10px">
                              acknowledged
                            </Badge>
                          )}
                          {alert.resolved && (
                            <Badge colorScheme="green" fontSize="10px">
                              resolved
                            </Badge>
                          )}
                        </HStack>
                        <Text fontSize="xs" color={subtleText}>
                          {alert.message}
                        </Text>
                      </Box>
                    </HStack>
                    {isActive && (
                      <Menu>
                        <MenuButton
                          as={IconButton}
                          icon={<MdMoreVert />}
                          variant="ghost"
                          size="sm"
                        />
                        <MenuList>
                          <MenuItem
                            icon={<MdVisibility />}
                            onClick={() => handleAcknowledge(alert.id)}
                          >
                            Acknowledge
                          </MenuItem>
                          <MenuItem
                            icon={<MdCheckCircle />}
                            onClick={() => handleResolve(alert.id)}
                          >
                            Mark Resolved
                          </MenuItem>
                        </MenuList>
                      </Menu>
                    )}
                  </HStack>

                  {(alert.thresholdValue !== null || alert.currentValue !== null) && (
                    <SimpleGrid columns={{ base: 2, md: 4 }} spacing="16px" mt="12px">
                      {alert.thresholdValue !== null && (
                        <Box>
                          <Text fontSize="10px" color={subtleText} textTransform="uppercase">
                            Threshold
                          </Text>
                          <Text fontSize="sm">{alert.thresholdValue.toLocaleString()}</Text>
                        </Box>
                      )}
                      {alert.currentValue !== null && (
                        <Box>
                          <Text fontSize="10px" color={subtleText} textTransform="uppercase">
                            Current Value
                          </Text>
                          <Text fontSize="sm" color={`${severityColor}.500`} fontWeight="600">
                            {alert.currentValue.toLocaleString()}
                          </Text>
                        </Box>
                      )}
                      {alert.thresholdValue !== null && alert.currentValue !== null && (
                        <Box>
                          <Text fontSize="10px" color={subtleText} textTransform="uppercase">
                            Deviation
                          </Text>
                          <HStack spacing="4px">
                            <Icon
                              as={alert.currentValue > alert.thresholdValue ? MdTrendingUp : MdTrendingDown}
                              color={`${severityColor}.500`}
                            />
                            <Text fontSize="sm" color={`${severityColor}.500`} fontWeight="600">
                              {alert.thresholdValue > 0
                                ? `${(((alert.currentValue - alert.thresholdValue) / alert.thresholdValue) * 100).toFixed(0)}%`
                                : 'N/A'}
                            </Text>
                          </HStack>
                        </Box>
                      )}
                    </SimpleGrid>
                  )}

                  {alert.details && Object.keys(alert.details).length > 0 && (
                    <Box mt="8px" p="8px" bg={cardBg} borderRadius="md">
                      <Text fontSize="10px" color={subtleText} mb="4px">Details</Text>
                      <Text fontSize="xs" fontFamily="mono">
                        {JSON.stringify(alert.details, null, 2)}
                      </Text>
                    </Box>
                  )}

                  <Text fontSize="10px" color={subtleText} mt="12px">
                    Detected: {formatTimeAgo(alert.createdAt)} ({formatTime(alert.createdAt)})
                  </Text>
                </Box>
              );
            })}

            {sortedAlerts.length === 0 && (
              <Box textAlign="center" py="40px">
                <Icon as={MdCheckCircle} color="green.500" boxSize="48px" mb="12px" />
                <Text color={textColor}>No alerts match your filters</Text>
                <Text fontSize="sm" color={subtleText}>
                  All systems operating within normal parameters
                </Text>
              </Box>
            )}
          </VStack>
        )}
      </Card>
    </Box>
  );
}
