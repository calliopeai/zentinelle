'use client';

import {
  Box,
  Button,
  Flex,
  Heading,
  Icon,
  Select,
  SimpleGrid,
  Spinner,
  Text,
  useColorModeValue,
  Progress,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  StatArrow,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Alert,
  AlertIcon,
} from '@chakra-ui/react';
import { useState, useMemo } from 'react';
import { useQuery } from '@apollo/client';
import { MdRefresh, MdTrendingUp, MdTimer, MdMemory, MdCloud, MdSmartToy } from 'react-icons/md';
import Card from 'components/card/Card';
import { GET_USAGE_METRICS } from 'graphql/usage';
import { GET_MONITORING_STATS } from 'graphql/monitoring';

function formatNumber(num: number): string {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
  return num.toString();
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function getUsageColor(percentage: number): string {
  if (percentage >= 90) return 'red';
  if (percentage >= 75) return 'orange';
  if (percentage >= 50) return 'yellow';
  return 'green';
}

export default function UsagePage() {
  const [period, setPeriod] = useState('current');

  const cardBg = useColorModeValue('white', 'navy.800');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.100');

  // Calculate date range based on period selection
  const dateRange = useMemo(() => {
    const now = new Date();
    const endDate = now.toISOString();
    let startDate: string;
    let granularity = 'day';

    switch (period) {
      case 'last30':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        break;
      case 'last90':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
        granularity = 'week';
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1).toISOString();
        granularity = 'month';
        break;
      default: // current billing period - last 30 days
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    }
    return { startDate, endDate, granularity };
  }, [period]);

  // Fetch usage metrics
  const { data: usageData, loading: usageLoading, refetch: refetchUsage } = useQuery(GET_USAGE_METRICS, {
    variables: dateRange,
    fetchPolicy: 'cache-and-network',
  });

  // Fetch monitoring stats for additional metrics
  const { data: statsData, loading: statsLoading, refetch: refetchStats } = useQuery(GET_MONITORING_STATS, {
    fetchPolicy: 'cache-and-network',
  });

  const loading = usageLoading || statsLoading;

  const handleRefresh = () => {
    refetchUsage();
    refetchStats();
  };

  // Extract data with safe defaults
  const summary = usageData?.usageMetrics?.summary || {};
  const timeSeries = usageData?.usageMetrics?.timeSeries || [];
  const byAgent = usageData?.usageMetrics?.byAgent || [];
  const stats = statsData?.monitoringStats || {};

  // Calculate percentages (no plan limits in standalone mode)
  const tokenLimit = 1_000_000;
  const storageLimit = 100;
  const totalTokens = summary.totalTokens || 0;
  const storageUsed = (summary.storageUsedMb || 0) / 1024; // Convert MB to GB

  const tokenPercentage = tokenLimit > 0 ? (totalTokens / tokenLimit) * 100 : 0;
  const storagePercentage = storageLimit > 0 ? (storageUsed / storageLimit) * 100 : 0;

  return (
    <Box pt={{ base: '130px', md: '80px', xl: '80px' }}>
      {/* Header */}
      <Flex justify="space-between" align="center" mb="20px">
        <Box>
          <Heading size="lg" color={textColor}>
            Usage Analytics
          </Heading>
          <Text fontSize="sm" color="secondaryGray.600">
            Monitor AI token usage, compute hours, and resource consumption
          </Text>
        </Box>
        <Flex gap="12px">
          <Select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            maxW="200px"
          >
            <option value="current">Current Period</option>
            <option value="last30">Last 30 Days</option>
            <option value="last90">Last 90 Days</option>
            <option value="year">Year to Date</option>
          </Select>
          <Button
            variant="outline"
            leftIcon={<Icon as={MdRefresh} />}
            onClick={handleRefresh}
            isLoading={loading}
          >
            Refresh
          </Button>
        </Flex>
      </Flex>

      {loading && !usageData && (
        <Flex justify="center" py="40px">
          <Spinner size="xl" color="brand.500" />
        </Flex>
      )}

      {/* Usage Overview */}
      <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} spacing="20px" mb="24px">
        <Card p="20px" bg={cardBg}>
          <Flex align="center" gap="16px">
            <Flex
              w="56px"
              h="56px"
              bg="brand.500"
              borderRadius="16px"
              align="center"
              justify="center"
            >
              <Icon as={MdCloud} color="white" boxSize="28px" />
            </Flex>
            <Box flex="1">
              <Text fontSize="sm" color="gray.500" mb="4px">
                AI Tokens Used
              </Text>
              <Text fontSize="2xl" fontWeight="700" color={textColor}>
                {formatNumber(totalTokens)}
              </Text>
              <Progress
                value={tokenPercentage}
                colorScheme={getUsageColor(tokenPercentage)}
                size="xs"
                mt="8px"
                borderRadius="full"
              />
              <Text fontSize="xs" color="gray.500" mt="4px">
                {tokenPercentage.toFixed(1)}% of {formatNumber(tokenLimit)} limit
              </Text>
            </Box>
          </Flex>
        </Card>

        <Card p="20px" bg={cardBg}>
          <Flex align="center" gap="16px">
            <Flex
              w="56px"
              h="56px"
              bg="green.500"
              borderRadius="16px"
              align="center"
              justify="center"
            >
              <Icon as={MdTimer} color="white" boxSize="28px" />
            </Flex>
            <Box flex="1">
              <Text fontSize="sm" color="gray.500" mb="4px">
                Total Interactions
              </Text>
              <Text fontSize="2xl" fontWeight="700" color={textColor}>
                {formatNumber(stats.totalInteractions || summary.totalApiCalls || 0)}
              </Text>
              <Text fontSize="xs" color="gray.500" mt="4px">
                {formatNumber(stats.interactionsToday || 0)} today
              </Text>
            </Box>
          </Flex>
        </Card>

        <Card p="20px" bg={cardBg}>
          <Flex align="center" gap="16px">
            <Flex
              w="56px"
              h="56px"
              bg="purple.500"
              borderRadius="16px"
              align="center"
              justify="center"
            >
              <Icon as={MdMemory} color="white" boxSize="28px" />
            </Flex>
            <Box flex="1">
              <Text fontSize="sm" color="gray.500" mb="4px">
                Storage Used
              </Text>
              <Text fontSize="2xl" fontWeight="700" color={textColor}>
                {storageUsed.toFixed(1)} GB
              </Text>
              <Progress
                value={storagePercentage}
                colorScheme={getUsageColor(storagePercentage)}
                size="xs"
                mt="8px"
                borderRadius="full"
              />
              <Text fontSize="xs" color="gray.500" mt="4px">
                {storagePercentage.toFixed(1)}% of {storageLimit} GB limit
              </Text>
            </Box>
          </Flex>
        </Card>

        <Card p="20px" bg={cardBg}>
          <Flex align="center" gap="16px">
            <Flex
              w="56px"
              h="56px"
              bg="orange.500"
              borderRadius="16px"
              align="center"
              justify="center"
            >
              <Icon as={MdTrendingUp} color="white" boxSize="28px" />
            </Flex>
            <Box flex="1">
              <Text fontSize="sm" color="gray.500" mb="4px">
                Estimated Cost
              </Text>
              <Text fontSize="2xl" fontWeight="700" color={textColor}>
                {formatCurrency(summary.totalCost || stats.totalCostToday || 0)}
              </Text>
            </Box>
          </Flex>
        </Card>
      </SimpleGrid>

      {/* Stats Row */}
      <SimpleGrid columns={{ base: 2, md: 4 }} spacing="20px" mb="24px">
        <Card p="16px" bg={cardBg}>
          <Stat>
            <StatLabel color="gray.500">Active Agents</StatLabel>
            <StatNumber color={textColor}>{summary.activeAgents || byAgent.length || 0}</StatNumber>
            <StatHelpText>
              Deployed endpoints
            </StatHelpText>
          </Stat>
        </Card>
        <Card p="16px" bg={cardBg}>
          <Stat>
            <StatLabel color="gray.500">Total Requests</StatLabel>
            <StatNumber color={textColor}>{formatNumber(summary.totalApiCalls || stats.totalInteractions || 0)}</StatNumber>
            <StatHelpText>
              This period
            </StatHelpText>
          </Stat>
        </Card>
        <Card p="16px" bg={cardBg}>
          <Stat>
            <StatLabel color="gray.500">Avg Response Time</StatLabel>
            <StatNumber color={textColor}>{stats.avgLatencyMs || 0}ms</StatNumber>
            <StatHelpText>
              Avg latency
            </StatHelpText>
          </Stat>
        </Card>
        <Card p="16px" bg={cardBg}>
          <Stat>
            <StatLabel color="gray.500">Scans Blocked</StatLabel>
            <StatNumber color={textColor}>{stats.scansBlocked || 0}</StatNumber>
            <StatHelpText>
              Content violations
            </StatHelpText>
          </Stat>
        </Card>
      </SimpleGrid>

      {/* Usage by Agent */}
      <SimpleGrid columns={{ base: 1, xl: 2 }} spacing="20px">
        <Card p="0" bg={cardBg}>
          <Box p="20px" borderBottom="1px solid" borderColor={borderColor}>
            <Text fontSize="lg" fontWeight="600" color={textColor}>
              Usage by Agent
            </Text>
            <Text fontSize="sm" color="gray.500">
              Top consuming agents this period
            </Text>
          </Box>
          <TableContainer>
            <Table variant="simple" size="sm">
              <Thead>
                <Tr>
                  <Th borderColor={borderColor}>Agent</Th>
                  <Th borderColor={borderColor} isNumeric>Tokens</Th>
                  <Th borderColor={borderColor} isNumeric>Requests</Th>
                  <Th borderColor={borderColor} isNumeric>Cost</Th>
                </Tr>
              </Thead>
              <Tbody>
                {byAgent.length > 0 ? (
                  byAgent.slice(0, 5).map((agent: { agentId: string; agentName: string; tokens: number; apiCalls: number; cost: number }) => (
                    <Tr key={agent.agentId}>
                      <Td borderColor={borderColor}>
                        <Flex align="center" gap="8px">
                          <Icon as={MdSmartToy} color="brand.500" />
                          <Text fontWeight="500">{agent.agentName || 'Unknown Agent'}</Text>
                        </Flex>
                      </Td>
                      <Td borderColor={borderColor} isNumeric>
                        {formatNumber(agent.tokens || 0)}
                      </Td>
                      <Td borderColor={borderColor} isNumeric>
                        {formatNumber(agent.apiCalls || 0)}
                      </Td>
                      <Td borderColor={borderColor} isNumeric>
                        {formatCurrency(agent.cost || 0)}
                      </Td>
                    </Tr>
                  ))
                ) : (
                  <Tr>
                    <Td colSpan={4} borderColor={borderColor} textAlign="center" py="20px">
                      <Text color="gray.500">No agent usage data yet</Text>
                    </Td>
                  </Tr>
                )}
              </Tbody>
            </Table>
          </TableContainer>
        </Card>

        <Card p="0" bg={cardBg}>
          <Box p="20px" borderBottom="1px solid" borderColor={borderColor}>
            <Text fontSize="lg" fontWeight="600" color={textColor}>
              Usage Trend
            </Text>
            <Text fontSize="sm" color="gray.500">
              Token and request consumption over time
            </Text>
          </Box>
          <TableContainer>
            <Table variant="simple" size="sm">
              <Thead>
                <Tr>
                  <Th borderColor={borderColor}>Date</Th>
                  <Th borderColor={borderColor} isNumeric>Tokens</Th>
                  <Th borderColor={borderColor} isNumeric>Requests</Th>
                  <Th borderColor={borderColor} isNumeric>Cost</Th>
                </Tr>
              </Thead>
              <Tbody>
                {timeSeries.length > 0 ? (
                  timeSeries.slice(-7).map((day: { date: string; tokens: number; apiCalls: number; cost: number }) => (
                    <Tr key={day.date}>
                      <Td borderColor={borderColor}>
                        {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </Td>
                      <Td borderColor={borderColor} isNumeric>
                        {formatNumber(day.tokens || 0)}
                      </Td>
                      <Td borderColor={borderColor} isNumeric>
                        {formatNumber(day.apiCalls || 0)}
                      </Td>
                      <Td borderColor={borderColor} isNumeric>
                        {formatCurrency(day.cost || 0)}
                      </Td>
                    </Tr>
                  ))
                ) : (
                  <Tr>
                    <Td colSpan={4} borderColor={borderColor} textAlign="center" py="20px">
                      <Text color="gray.500">No usage history yet</Text>
                    </Td>
                  </Tr>
                )}
              </Tbody>
            </Table>
          </TableContainer>
        </Card>
      </SimpleGrid>
    </Box>
  );
}
