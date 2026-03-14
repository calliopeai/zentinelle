'use client';

import {
  Box,
  VStack,
  HStack,
  SimpleGrid,
  Text,
  Badge,
  Icon,
  Progress,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Select,
  useColorModeValue,
  Flex,
  Tooltip,
  Spinner,
  Alert,
  AlertIcon,
} from '@chakra-ui/react';
import { useState, useMemo } from 'react';
import { useQuery } from '@apollo/client';
import {
  MdSecurity,
  MdWarning,
  MdCreditCard,
  MdEmail,
  MdPhone,
  MdBadge,
  MdShield,
  MdBugReport,
  MdGppBad,
} from 'react-icons/md';
import Card from 'components/card/Card';
import { GET_CONTENT_SCANS, GET_CONTENT_VIOLATIONS, GET_MONITORING_STATS } from 'graphql/monitoring';

interface ContentScannerDashboardProps {
  period?: '1h' | '24h' | '7d' | '30d';
  onPeriodChange?: (period: string) => void;
}

interface Violation {
  id: string;
  ruleType: string;
  ruleTypeDisplay: string;
  severity: string;
  severityDisplay: string;
  ruleName: string | null;
  category: string;
  wasBlocked: boolean;
  wasRedacted: boolean;
  createdAt: string;
}

interface ContentScan {
  id: string;
  userIdentifier: string;
  endpointName: string | null;
  contentType: string;
  contentTypeDisplay: string;
  hasViolations: boolean;
  violationCount: number;
  maxSeverity: string | null;
  actionTaken: string | null;
  wasBlocked: boolean;
  wasRedacted: boolean;
  createdAt: string;
  violations: Violation[];
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString();
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
      startDate.setDate(startDate.getDate() - 1);
  }

  return { startDate, endDate };
}

export default function ContentScannerDashboard({
  period = '24h',
  onPeriodChange,
}: ContentScannerDashboardProps) {
  const cardBg = useColorModeValue('white', 'navy.800');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.200');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const subtleText = useColorModeValue('gray.500', 'gray.400');
  const redBg = useColorModeValue('red.50', 'whiteAlpha.100');

  const [selectedPeriod, setSelectedPeriod] = useState(period);
  const { startDate, endDate } = getPeriodDates(selectedPeriod);

  // Fetch content scans with violations
  const { data: scansData, loading: scansLoading, error: scansError } = useQuery(GET_CONTENT_SCANS, {
    variables: {
      hasViolations: true,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      first: 100,
    },
    pollInterval: 30000,
  });

  // Fetch all violations for breakdown
  const { data: violationsData, loading: violationsLoading } = useQuery(GET_CONTENT_VIOLATIONS, {
    variables: {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      first: 500,
    },
    pollInterval: 30000,
  });

  // Fetch monitoring stats
  const { data: statsData } = useQuery(GET_MONITORING_STATS, {
    pollInterval: 30000,
  });

  const handlePeriodChange = (newPeriod: string) => {
    setSelectedPeriod(newPeriod as typeof selectedPeriod);
    onPeriodChange?.(newPeriod);
  };

  // Transform scans data
  const scans: ContentScan[] = useMemo(() => {
    if (!scansData?.contentScans?.edges) return [];
    return scansData.contentScans.edges.map((edge: { node: ContentScan }) => edge.node);
  }, [scansData]);

  // Transform violations data
  const violations: Violation[] = useMemo(() => {
    if (!violationsData?.contentViolations?.edges) return [];
    return violationsData.contentViolations.edges.map((edge: { node: Violation }) => edge.node);
  }, [violationsData]);

  // Calculate stats from violations
  const stats = useMemo(() => {
    const monitoringStats = statsData?.monitoringStats;

    // Group violations by type
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    let blocked = 0;
    let redacted = 0;

    violations.forEach((v) => {
      byType[v.ruleType] = (byType[v.ruleType] || 0) + 1;
      bySeverity[v.severity] = (bySeverity[v.severity] || 0) + 1;
      if (v.wasBlocked) blocked++;
      if (v.wasRedacted) redacted++;
    });

    return {
      totalScanned: monitoringStats?.totalScans || 0,
      totalViolations: violations.length,
      blocked,
      redacted,
      byType,
      bySeverity,
      violationsByType: monitoringStats?.violationsByType || [],
      violationsBySeverity: monitoringStats?.violationsBySeverity || [],
    };
  }, [violations, statsData]);

  // PII stats
  const piiStats = useMemo(() => {
    const piiTypes = ['pii_detection', 'phi_detection', 'secret_detection'];
    let total = 0;
    let redacted = 0;

    violations.forEach((v) => {
      if (piiTypes.includes(v.ruleType)) {
        total++;
        if (v.wasRedacted) redacted++;
      }
    });

    const byCategory: Record<string, number> = {};
    violations.filter(v => piiTypes.includes(v.ruleType)).forEach((v) => {
      const cat = v.category || v.ruleType;
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    });

    return {
      total,
      redacted,
      byCategory,
    };
  }, [violations]);

  // Security stats
  const securityStats = useMemo(() => {
    const securityTypes = ['prompt_injection', 'jailbreak_attempt', 'policy_violation'];
    let total = 0;
    let blocked = 0;

    const byType: Record<string, number> = {};
    violations.forEach((v) => {
      if (securityTypes.includes(v.ruleType)) {
        total++;
        if (v.wasBlocked) blocked++;
        byType[v.ruleType] = (byType[v.ruleType] || 0) + 1;
      }
    });

    return {
      total,
      blocked,
      byType,
    };
  }, [violations]);

  // Content moderation stats
  const contentStats = useMemo(() => {
    const contentTypes = ['profanity_filter', 'keyword_block', 'custom_pattern', 'off_topic'];
    let total = 0;

    const byType: Record<string, number> = {};
    violations.forEach((v) => {
      if (contentTypes.includes(v.ruleType)) {
        total++;
        byType[v.ruleType] = (byType[v.ruleType] || 0) + 1;
      }
    });

    return { total, byType };
  }, [violations]);

  // Recent violations for table
  const recentViolations = useMemo(() => {
    // Flatten violations from scans with context
    const flatViolations: Array<Violation & { userId: string; endpoint: string }> = [];

    scans.forEach((scan) => {
      scan.violations?.forEach((v) => {
        flatViolations.push({
          ...v,
          userId: scan.userIdentifier,
          endpoint: scan.endpointName || 'N/A',
        });
      });
    });

    return flatViolations.slice(0, 10);
  }, [scans]);

  const severityColors: Record<string, string> = {
    info: 'gray',
    low: 'gray',
    medium: 'yellow',
    high: 'orange',
    critical: 'red',
  };

  const actionColors: Record<string, string> = {
    redact: 'blue',
    block: 'red',
    warn: 'orange',
    log_only: 'gray',
  };

  const ruleTypeColors: Record<string, string> = {
    pii_detection: 'purple',
    phi_detection: 'purple',
    secret_detection: 'purple',
    prompt_injection: 'red',
    jailbreak_attempt: 'red',
    profanity_filter: 'orange',
    keyword_block: 'orange',
    policy_violation: 'red',
  };

  if (scansError) {
    return (
      <Alert status="error">
        <AlertIcon />
        Failed to load content scanner data: {scansError.message}
      </Alert>
    );
  }

  const totalScanned = stats.totalScanned || 1;
  const violationRate = (stats.totalViolations / totalScanned * 100);

  return (
    <Box>
      {/* Period Selector */}
      <Flex justify="flex-end" mb="16px">
        <Select
          value={selectedPeriod}
          onChange={(e) => handlePeriodChange(e.target.value)}
          maxW="150px"
          size="sm"
        >
          <option value="1h">Last Hour</option>
          <option value="24h">Last 24 Hours</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
        </Select>
      </Flex>

      {scansLoading && violations.length === 0 ? (
        <Box p="40px" textAlign="center">
          <Spinner size="lg" color="brand.500" />
          <Text mt="16px" color="gray.500">Loading scanner data...</Text>
        </Box>
      ) : (
        <>
          {/* Overview Stats */}
          <SimpleGrid columns={{ base: 2, md: 4 }} spacing="16px" mb="20px">
            <Card p="20px" bg={cardBg}>
              <Stat>
                <StatLabel color={subtleText}>Total Scanned</StatLabel>
                <StatNumber color={textColor}>{stats.totalScanned.toLocaleString()}</StatNumber>
                <StatHelpText>
                  {selectedPeriod === '24h' ? 'Last 24 hours' : `Last ${selectedPeriod}`}
                </StatHelpText>
              </Stat>
            </Card>
            <Card p="20px" bg={cardBg}>
              <Stat>
                <StatLabel color={subtleText}>PII Detected</StatLabel>
                <StatNumber color="purple.500">{piiStats.total}</StatNumber>
                <StatHelpText>
                  {piiStats.redacted} redacted ({piiStats.total > 0 ? Math.round(piiStats.redacted / piiStats.total * 100) : 0}%)
                </StatHelpText>
              </Stat>
            </Card>
            <Card p="20px" bg={cardBg}>
              <Stat>
                <StatLabel color={subtleText}>Content Flagged</StatLabel>
                <StatNumber color="orange.500">{contentStats.total}</StatNumber>
                <StatHelpText>
                  Moderation rules triggered
                </StatHelpText>
              </Stat>
            </Card>
            <Card p="20px" bg={cardBg}>
              <Stat>
                <StatLabel color={subtleText}>Security Blocked</StatLabel>
                <StatNumber color="red.500">{securityStats.blocked}</StatNumber>
                <StatHelpText>
                  {violationRate.toFixed(2)}% violation rate
                </StatHelpText>
              </Stat>
            </Card>
          </SimpleGrid>

          <SimpleGrid columns={{ base: 1, lg: 2 }} spacing="20px" mb="20px">
            {/* PII Detection Breakdown */}
            <Card p="20px" bg={cardBg}>
              <HStack mb="16px">
                <Flex
                  w="36px"
                  h="36px"
                  bg="purple.500"
                  borderRadius="10px"
                  align="center"
                  justify="center"
                >
                  <Icon as={MdShield} color="white" boxSize="18px" />
                </Flex>
                <Box>
                  <Text fontSize="md" fontWeight="600" color={textColor}>PII Detection</Text>
                  <Text fontSize="xs" color={subtleText}>Personal data identified and redacted</Text>
                </Box>
              </HStack>

              {piiStats.total === 0 ? (
                <Text color="gray.500" fontSize="sm" textAlign="center" py="20px">
                  No PII detected in this period
                </Text>
              ) : (
                <VStack align="stretch" spacing="12px">
                  {Object.entries(piiStats.byCategory).slice(0, 5).map(([type, count]) => {
                    const iconMap: Record<string, React.ElementType> = {
                      credit_card: MdCreditCard,
                      ssn: MdBadge,
                      email: MdEmail,
                      phone: MdPhone,
                      default: MdBugReport,
                    };
                    const IconComponent = iconMap[type] || iconMap.default;
                    const maxValue = Math.max(...Object.values(piiStats.byCategory));

                    return (
                      <HStack key={type} spacing="12px">
                        <Icon as={IconComponent} color="purple.500" boxSize="16px" />
                        <Text fontSize="sm" minW="120px" textTransform="capitalize">
                          {type.replace(/_/g, ' ')}
                        </Text>
                        <Progress
                          value={(count / maxValue) * 100}
                          colorScheme="purple"
                          size="sm"
                          flex="1"
                          borderRadius="full"
                        />
                        <Text fontSize="sm" fontWeight="500" minW="40px" textAlign="right">
                          {count}
                        </Text>
                      </HStack>
                    );
                  })}
                </VStack>
              )}
            </Card>

            {/* Content Moderation Breakdown */}
            <Card p="20px" bg={cardBg}>
              <HStack mb="16px">
                <Flex
                  w="36px"
                  h="36px"
                  bg="orange.500"
                  borderRadius="10px"
                  align="center"
                  justify="center"
                >
                  <Icon as={MdWarning} color="white" boxSize="18px" />
                </Flex>
                <Box>
                  <Text fontSize="md" fontWeight="600" color={textColor}>Content Moderation</Text>
                  <Text fontSize="xs" color={subtleText}>Harmful content detection</Text>
                </Box>
              </HStack>

              {contentStats.total === 0 ? (
                <Text color="gray.500" fontSize="sm" textAlign="center" py="20px">
                  No content violations in this period
                </Text>
              ) : (
                <VStack align="stretch" spacing="12px">
                  {Object.entries(contentStats.byType).slice(0, 6).map(([type, count]) => {
                    const maxValue = Math.max(...Object.values(contentStats.byType));
                    const colorMap: Record<string, string> = {
                      profanity_filter: 'yellow',
                      keyword_block: 'orange',
                      custom_pattern: 'blue',
                      off_topic: 'purple',
                    };

                    return (
                      <HStack key={type} spacing="12px">
                        <Box w="8px" h="8px" borderRadius="full" bg={`${colorMap[type] || 'gray'}.500`} />
                        <Text fontSize="sm" minW="120px" textTransform="capitalize">
                          {type.replace(/_/g, ' ')}
                        </Text>
                        <Progress
                          value={(count / maxValue) * 100}
                          colorScheme={colorMap[type] || 'gray'}
                          size="sm"
                          flex="1"
                          borderRadius="full"
                        />
                        <Text fontSize="sm" fontWeight="500" minW="40px" textAlign="right">
                          {count}
                        </Text>
                      </HStack>
                    );
                  })}
                </VStack>
              )}
            </Card>
          </SimpleGrid>

          {/* Security Threats */}
          <Card p="20px" bg={cardBg} mb="20px">
            <HStack mb="16px">
              <Flex
                w="36px"
                h="36px"
                bg="red.500"
                borderRadius="10px"
                align="center"
                justify="center"
              >
                <Icon as={MdGppBad} color="white" boxSize="18px" />
              </Flex>
              <Box>
                <Text fontSize="md" fontWeight="600" color={textColor}>Security Threats</Text>
                <Text fontSize="xs" color={subtleText}>Attempted attacks and exploits</Text>
              </Box>
            </HStack>

            <SimpleGrid columns={{ base: 2, md: 5 }} spacing="16px">
              {[
                { label: 'Prompt Injection', key: 'prompt_injection', desc: 'Attempts to override system prompts' },
                { label: 'Jailbreak Attempts', key: 'jailbreak_attempt', desc: 'Attempts to bypass safety guardrails' },
                { label: 'Policy Violations', key: 'policy_violation', desc: 'Violations of organization policies' },
                { label: 'Total Blocked', key: 'blocked', desc: 'Total requests blocked' },
                { label: 'Total Detected', key: 'total', desc: 'All security threats detected' },
              ].map((item) => (
                <Tooltip key={item.label} label={item.desc}>
                  <Box
                    p="16px"
                    bg={redBg}
                    borderRadius="lg"
                    textAlign="center"
                    cursor="help"
                  >
                    <Text fontSize="2xl" fontWeight="700" color="red.500">
                      {item.key === 'blocked' ? securityStats.blocked :
                       item.key === 'total' ? securityStats.total :
                       securityStats.byType[item.key] || 0}
                    </Text>
                    <Text fontSize="xs" color={subtleText}>
                      {item.label}
                    </Text>
                  </Box>
                </Tooltip>
              ))}
            </SimpleGrid>
          </Card>

          {/* Recent Violations Table */}
          <Card p="20px" bg={cardBg}>
            <HStack mb="16px" justify="space-between">
              <HStack>
                <Flex
                  w="36px"
                  h="36px"
                  bg="brand.500"
                  borderRadius="10px"
                  align="center"
                  justify="center"
                >
                  <Icon as={MdSecurity} color="white" boxSize="18px" />
                </Flex>
                <Box>
                  <Text fontSize="md" fontWeight="600" color={textColor}>Recent Violations</Text>
                  <Text fontSize="xs" color={subtleText}>Latest detected issues</Text>
                </Box>
              </HStack>
            </HStack>

            {recentViolations.length === 0 ? (
              <Text color="gray.500" fontSize="sm" textAlign="center" py="20px">
                No violations detected in this period
              </Text>
            ) : (
              <Box overflowX="auto">
                <Table size="sm">
                  <Thead>
                    <Tr>
                      <Th borderColor={borderColor}>Time</Th>
                      <Th borderColor={borderColor}>Type</Th>
                      <Th borderColor={borderColor}>Category</Th>
                      <Th borderColor={borderColor}>Severity</Th>
                      <Th borderColor={borderColor}>Action</Th>
                      <Th borderColor={borderColor}>User</Th>
                      <Th borderColor={borderColor}>Endpoint</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {recentViolations.map((violation) => (
                      <Tr key={violation.id}>
                        <Td borderColor={borderColor}>
                          <Text fontSize="xs" fontFamily="mono">
                            {formatTime(violation.createdAt)}
                          </Text>
                        </Td>
                        <Td borderColor={borderColor}>
                          <Text fontSize="xs">{violation.ruleTypeDisplay || violation.ruleType}</Text>
                        </Td>
                        <Td borderColor={borderColor}>
                          <Badge colorScheme={ruleTypeColors[violation.ruleType] || 'gray'} fontSize="10px">
                            {violation.category || violation.ruleType.replace(/_/g, ' ')}
                          </Badge>
                        </Td>
                        <Td borderColor={borderColor}>
                          <Badge colorScheme={severityColors[violation.severity] || 'gray'} fontSize="10px">
                            {violation.severityDisplay || violation.severity}
                          </Badge>
                        </Td>
                        <Td borderColor={borderColor}>
                          <Badge
                            colorScheme={violation.wasBlocked ? 'red' : violation.wasRedacted ? 'blue' : 'gray'}
                            fontSize="10px"
                          >
                            {violation.wasBlocked ? 'blocked' : violation.wasRedacted ? 'redacted' : 'logged'}
                          </Badge>
                        </Td>
                        <Td borderColor={borderColor}>
                          <Text fontSize="xs">{violation.userId}</Text>
                        </Td>
                        <Td borderColor={borderColor}>
                          <Badge variant="subtle" fontSize="10px">
                            {violation.endpoint}
                          </Badge>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>
            )}
          </Card>
        </>
      )}
    </Box>
  );
}
