'use client';

import {
  Box,
  VStack,
  HStack,
  Text,
  Icon,
  useColorModeValue,
  SimpleGrid,
  Select,
  Flex,
  Spinner,
  Badge,
  Divider,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Progress,
  Tooltip,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Code,
  Collapse,
  IconButton,
  Alert,
  AlertIcon,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  FormControl,
  FormLabel,
} from '@chakra-ui/react';
import { useQuery } from '@apollo/client';
import { useState, useMemo } from 'react';
import {
  MdSpeed,
  MdDataUsage,
  MdAttachMoney,
  MdExpandMore,
  MdExpandLess,
  MdBusiness,
  MdCloud,
  MdApi,
  MdPerson,
  MdGroup,
  MdWarning,
  MdCheckCircle,
  MdTrendingUp,
  MdCalculate,
} from 'react-icons/md';
import Card from 'components/card/Card';
import { GET_POLICIES, GET_EFFECTIVE_POLICIES } from 'graphql/policies';
import { GET_DEPLOYMENTS } from 'graphql/deployments';
import { GET_AGENT_ENDPOINTS } from 'graphql/agents';
import { GET_AI_USAGE_SUMMARY } from 'graphql/usage';
import { GET_MONITORING_STATS } from 'graphql/monitoring';
import { useOrganization } from 'contexts/OrganizationContext';

// =============================================================================
// Types
// =============================================================================

interface UsageSummary {
  periodStart: string;
  periodEnd: string;
  totalRequests: number;
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  byProvider: Array<{
    provider: string;
    providerDisplay: string;
    totalRequests: number;
    totalTokens: number;
    totalCostUsd: number;
  }>;
  byModel: Array<{
    provider: string;
    model: string;
    totalRequests: number;
    totalTokens: number;
    totalCostUsd: number;
  }>;
}

interface MonitoringStats {
  totalInteractions: number;
  interactionsToday: number;
  totalTokensToday: number;
  totalCostToday: number;
}

interface Policy {
  id: string;
  name: string;
  description: string;
  policyType: string;
  scopeType: string;
  scopeName: string;
  config: Record<string, unknown>;
  priority: number;
  enforcement: string;
  enabled: boolean;
  inheritedFrom?: string;
}

interface Deployment {
  id: string;
  name: string;
  slug: string;
}

interface Endpoint {
  id: string;
  name: string;
  agentId: string;
  deployment?: { id: string; name: string };
}

// =============================================================================
// Constants - Model Pricing (per 1M tokens)
// =============================================================================

const MODEL_PRICING = {
  'gpt-4o': { input: 2.50, output: 10.00, contextWindow: 128000 },
  'gpt-4o-mini': { input: 0.15, output: 0.60, contextWindow: 128000 },
  'gpt-4-turbo': { input: 10.00, output: 30.00, contextWindow: 128000 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50, contextWindow: 16385 },
  'claude-3-opus': { input: 15.00, output: 75.00, contextWindow: 200000 },
  'claude-3-sonnet': { input: 3.00, output: 15.00, contextWindow: 200000 },
  'claude-3-haiku': { input: 0.25, output: 1.25, contextWindow: 200000 },
  'claude-3.5-sonnet': { input: 3.00, output: 15.00, contextWindow: 200000 },
  'gemini-pro': { input: 0.50, output: 1.50, contextWindow: 32000 },
  'gemini-1.5-pro': { input: 3.50, output: 10.50, contextWindow: 1000000 },
};

const DEFAULT_MODEL = 'gpt-4o-mini';

const SCOPE_ICONS: Record<string, React.ElementType> = {
  organization: MdBusiness,
  sub_organization: MdGroup,
  deployment: MdCloud,
  endpoint: MdApi,
  user: MdPerson,
};

const SCOPE_COLORS: Record<string, string> = {
  organization: 'purple',
  sub_organization: 'blue',
  deployment: 'green',
  endpoint: 'orange',
  user: 'pink',
};

const SCOPE_ORDER = ['organization', 'sub_organization', 'deployment', 'endpoint', 'user'];

// =============================================================================
// Utility Functions
// =============================================================================

function estimateTokens(text: string): number {
  if (!text) return 0;
  // Rough estimate: ~4 characters per token for English text
  return Math.ceil(text.length / 4);
}

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toFixed(0);
}

function formatCurrency(amount: number): string {
  if (amount < 0.01) return '<$0.01';
  if (amount < 1) return '$' + amount.toFixed(2);
  if (amount >= 1000) return '$' + (amount / 1000).toFixed(2) + 'K';
  return '$' + amount.toFixed(2);
}

function getPromptTextFromPolicy(policy: Policy): string {
  if (policy.policyType === 'system_prompt') {
    return (policy.config?.prompt_text as string) || '';
  }
  if (policy.policyType === 'ai_guardrail') {
    // Guardrails add overhead too - estimate based on config
    const config = policy.config || {};
    const parts: string[] = [];
    if (config.blocked_topics && Array.isArray(config.blocked_topics)) {
      parts.push(`Blocked topics: ${(config.blocked_topics as string[]).join(', ')}`);
    }
    if (config.pii_redaction) parts.push('PII redaction enabled');
    if (config.prompt_injection_detection) parts.push('Prompt injection detection enabled');
    return parts.join('. ');
  }
  return '';
}

// =============================================================================
// Components
// =============================================================================

function PolicyRow({
  policy,
  isExpanded,
  onToggle,
  textColor,
  subtleText,
}: {
  policy: Policy;
  isExpanded: boolean;
  onToggle: () => void;
  textColor: string;
  subtleText: string;
}) {
  const promptText = getPromptTextFromPolicy(policy);
  const tokens = estimateTokens(promptText);
  const ScopeIcon = SCOPE_ICONS[policy.scopeType] || MdBusiness;
  const scopeColor = SCOPE_COLORS[policy.scopeType] || 'gray';

  if (tokens === 0) return null;

  return (
    <>
      <Tr
        cursor="pointer"
        onClick={onToggle}
        _hover={{ bg: useColorModeValue('gray.50', 'whiteAlpha.50') }}
      >
        <Td>
          <HStack spacing="8px">
            <Icon as={ScopeIcon} color={`${scopeColor}.500`} />
            <Text fontWeight="500" color={textColor}>
              {policy.name}
            </Text>
            {policy.inheritedFrom && (
              <Badge colorScheme="gray" fontSize="10px">
                inherited
              </Badge>
            )}
          </HStack>
        </Td>
        <Td>
          <Badge colorScheme={scopeColor} fontSize="xs">
            {policy.scopeType.replace('_', ' ')}
          </Badge>
        </Td>
        <Td>
          <Badge
            colorScheme={policy.policyType === 'system_prompt' ? 'blue' : 'orange'}
            fontSize="xs"
          >
            {policy.policyType.replace('_', ' ')}
          </Badge>
        </Td>
        <Td isNumeric>
          <Text fontWeight="600" color={textColor}>
            {formatNumber(tokens)}
          </Text>
        </Td>
        <Td>
          <IconButton
            aria-label="Expand"
            icon={isExpanded ? <MdExpandLess /> : <MdExpandMore />}
            size="sm"
            variant="ghost"
          />
        </Td>
      </Tr>
      <Tr>
        <Td colSpan={5} p="0" borderBottom={isExpanded ? '1px' : 'none'}>
          <Collapse in={isExpanded}>
            <Box p="16px" bg={useColorModeValue('gray.50', 'whiteAlpha.50')}>
              <Text fontSize="sm" fontWeight="500" mb="8px" color={textColor}>
                Prompt Text ({promptText.length} chars → ~{tokens} tokens)
              </Text>
              <Code
                display="block"
                whiteSpace="pre-wrap"
                p="12px"
                borderRadius="8px"
                fontSize="xs"
                maxH="200px"
                overflow="auto"
              >
                {promptText || '(no prompt text)'}
              </Code>
            </Box>
          </Collapse>
        </Td>
      </Tr>
    </>
  );
}

function CostForecast({
  totalTokens,
  cardBg,
  textColor,
  subtleText,
}: {
  totalTokens: number;
  cardBg: string;
  textColor: string;
  subtleText: string;
}) {
  const [requestsPerMonth, setRequestsPerMonth] = useState(10000);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);

  const pricing = MODEL_PRICING[selectedModel as keyof typeof MODEL_PRICING] || MODEL_PRICING[DEFAULT_MODEL];

  const calculations = useMemo(() => {
    const tokensPerMonth = totalTokens * requestsPerMonth;
    const costPerMonth = (tokensPerMonth / 1_000_000) * pricing.input;
    const contextUsagePercent = (totalTokens / pricing.contextWindow) * 100;

    return {
      tokensPerMonth,
      costPerMonth,
      costPerRequest: (totalTokens / 1_000_000) * pricing.input,
      contextUsagePercent,
      annualCost: costPerMonth * 12,
    };
  }, [totalTokens, requestsPerMonth, pricing]);

  return (
    <Card p="20px" bg={cardBg}>
      <HStack spacing="12px" mb="16px">
        <Icon as={MdCalculate} color="green.500" boxSize="24px" />
        <Text fontWeight="600" color={textColor}>
          Cost Forecast
        </Text>
      </HStack>

      <SimpleGrid columns={{ base: 1, md: 2 }} spacing="20px" mb="20px">
        <FormControl>
          <FormLabel fontSize="sm" color={subtleText}>
            Expected Requests / Month
          </FormLabel>
          <NumberInput
            value={requestsPerMonth}
            onChange={(_, val) => setRequestsPerMonth(val || 0)}
            min={0}
            max={10000000}
            step={1000}
          >
            <NumberInputField />
            <NumberInputStepper>
              <NumberIncrementStepper />
              <NumberDecrementStepper />
            </NumberInputStepper>
          </NumberInput>
        </FormControl>

        <FormControl>
          <FormLabel fontSize="sm" color={subtleText}>
            Target Model
          </FormLabel>
          <Select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            {Object.entries(MODEL_PRICING).map(([model, info]) => (
              <option key={model} value={model}>
                {model} (${info.input}/1M input)
              </option>
            ))}
          </Select>
        </FormControl>
      </SimpleGrid>

      <Slider
        value={requestsPerMonth}
        onChange={setRequestsPerMonth}
        min={0}
        max={1000000}
        step={10000}
        mb="20px"
      >
        <SliderTrack>
          <SliderFilledTrack bg="brand.500" />
        </SliderTrack>
        <SliderThumb boxSize="20px" />
      </Slider>

      <SimpleGrid columns={{ base: 2, md: 4 }} spacing="16px">
        <Stat>
          <StatLabel color={subtleText}>Monthly Overhead</StatLabel>
          <StatNumber color={textColor} fontSize="xl">
            {formatNumber(calculations.tokensPerMonth)}
          </StatNumber>
          <StatHelpText>tokens</StatHelpText>
        </Stat>

        <Stat>
          <StatLabel color={subtleText}>Monthly Cost</StatLabel>
          <StatNumber color="green.500" fontSize="xl">
            {formatCurrency(calculations.costPerMonth)}
          </StatNumber>
          <StatHelpText>overhead only</StatHelpText>
        </Stat>

        <Stat>
          <StatLabel color={subtleText}>Cost Per Request</StatLabel>
          <StatNumber color={textColor} fontSize="xl">
            {calculations.costPerRequest < 0.0001
              ? '<$0.0001'
              : '$' + calculations.costPerRequest.toFixed(4)}
          </StatNumber>
          <StatHelpText>overhead only</StatHelpText>
        </Stat>

        <Stat>
          <StatLabel color={subtleText}>Annual Cost</StatLabel>
          <StatNumber color="orange.500" fontSize="xl">
            {formatCurrency(calculations.annualCost)}
          </StatNumber>
          <StatHelpText>projected</StatHelpText>
        </Stat>
      </SimpleGrid>

      <Divider my="16px" />

      <Box>
        <HStack justify="space-between" mb="8px">
          <Text fontSize="sm" color={subtleText}>
            Context Window Usage
          </Text>
          <Text fontSize="sm" fontWeight="600" color={textColor}>
            {calculations.contextUsagePercent.toFixed(2)}%
          </Text>
        </HStack>
        <Progress
          value={calculations.contextUsagePercent}
          size="sm"
          colorScheme={
            calculations.contextUsagePercent > 50
              ? 'red'
              : calculations.contextUsagePercent > 25
                ? 'orange'
                : 'green'
          }
          borderRadius="full"
        />
        <Text fontSize="xs" color={subtleText} mt="4px">
          {formatNumber(totalTokens)} / {formatNumber(pricing.contextWindow)} tokens reserved for
          policies
        </Text>
      </Box>

      {calculations.contextUsagePercent > 25 && (
        <Alert status="warning" mt="16px" borderRadius="8px">
          <AlertIcon />
          <Text fontSize="sm">
            Policy overhead uses {calculations.contextUsagePercent.toFixed(1)}% of context window.
            Consider optimizing prompts to leave more room for conversations.
          </Text>
        </Alert>
      )}
    </Card>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export default function PolicyOverheadDashboard() {
  const cardBg = useColorModeValue('white', 'navy.800');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const subtleText = useColorModeValue('gray.500', 'gray.400');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.200');

  const { organization } = useOrganization();
  const [selectedDeploymentId, setSelectedDeploymentId] = useState('');
  const [selectedEndpointId, setSelectedEndpointId] = useState('');
  const [expandedPolicies, setExpandedPolicies] = useState<Set<string>>(new Set());
  const [usageDays, setUsageDays] = useState(30);

  // Fetch deployments and endpoints for context selection
  const { data: deploymentsData, loading: deploymentsLoading } = useQuery(GET_DEPLOYMENTS);
  const { data: endpointsData, loading: endpointsLoading } = useQuery(GET_AGENT_ENDPOINTS);

  // Fetch all policies (we'll filter client-side for now)
  const { data: policiesData, loading: policiesLoading } = useQuery(GET_POLICIES, {
    variables: { first: 100 },
  });

  // Fetch real usage data
  const { data: usageData, loading: usageLoading } = useQuery(GET_AI_USAGE_SUMMARY, {
    variables: {
      organizationId: organization?.id,
      deploymentId: selectedDeploymentId || undefined,
      days: usageDays,
    },
    skip: !organization?.id,
  });

  // Fetch today's monitoring stats
  const { data: statsData, loading: statsLoading } = useQuery(GET_MONITORING_STATS);

  const usageSummary: UsageSummary | null = usageData?.aiUsageSummary || null;
  const monitoringStats: MonitoringStats | null = statsData?.monitoringStats || null;

  const deployments: Deployment[] = deploymentsData?.deployments?.edges?.map(
    (e: { node: Deployment }) => e.node
  ) || [];
  const endpoints: Endpoint[] = endpointsData?.agentEndpoints?.edges?.map(
    (e: { node: Endpoint }) => e.node
  ) || [];
  const allPolicies: Policy[] = policiesData?.policies?.edges?.map(
    (e: { node: Policy }) => e.node
  ) || [];

  // Filter endpoints by selected deployment
  const filteredEndpoints = useMemo(() => {
    if (!selectedDeploymentId) return endpoints;
    return endpoints.filter((e) => e.deployment?.id === selectedDeploymentId);
  }, [endpoints, selectedDeploymentId]);

  // Get effective policies for selected context
  const effectivePolicies = useMemo(() => {
    let policies = allPolicies.filter((p) => p.enabled);

    // Filter by scope based on selection
    if (selectedEndpointId) {
      // Show org + deployment + endpoint policies
      const endpoint = endpoints.find((e) => e.id === selectedEndpointId);
      policies = policies.filter(
        (p) =>
          p.scopeType === 'organization' ||
          (p.scopeType === 'deployment' && endpoint?.deployment?.id) ||
          (p.scopeType === 'endpoint' && p.scopeName?.includes(endpoint?.name || ''))
      );
    } else if (selectedDeploymentId) {
      // Show org + deployment policies
      policies = policies.filter(
        (p) => p.scopeType === 'organization' || p.scopeType === 'deployment'
      );
    } else {
      // Show only org-level policies
      policies = policies.filter((p) => p.scopeType === 'organization');
    }

    // Sort by scope order then priority
    return policies.sort((a, b) => {
      const scopeOrderA = SCOPE_ORDER.indexOf(a.scopeType);
      const scopeOrderB = SCOPE_ORDER.indexOf(b.scopeType);
      if (scopeOrderA !== scopeOrderB) return scopeOrderA - scopeOrderB;
      return b.priority - a.priority;
    });
  }, [allPolicies, selectedDeploymentId, selectedEndpointId, endpoints]);

  // Calculate token overhead
  const tokenBreakdown = useMemo(() => {
    const breakdown: Record<string, { tokens: number; count: number }> = {};
    let total = 0;

    effectivePolicies.forEach((policy) => {
      const text = getPromptTextFromPolicy(policy);
      const tokens = estimateTokens(text);
      if (tokens > 0) {
        if (!breakdown[policy.scopeType]) {
          breakdown[policy.scopeType] = { tokens: 0, count: 0 };
        }
        breakdown[policy.scopeType].tokens += tokens;
        breakdown[policy.scopeType].count += 1;
        total += tokens;
      }
    });

    return { breakdown, total };
  }, [effectivePolicies]);

  const togglePolicy = (id: string) => {
    const newSet = new Set(expandedPolicies);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedPolicies(newSet);
  };

  const loading = deploymentsLoading || endpointsLoading || policiesLoading;
  const metricsLoading = usageLoading || statsLoading;

  // Calculate actual overhead from real usage
  const actualMetrics = useMemo(() => {
    if (!usageSummary) return null;

    const avgOverheadPerRequest = usageSummary.totalRequests > 0
      ? usageSummary.totalInputTokens / usageSummary.totalRequests
      : 0;

    // Estimate policy overhead as a portion of input tokens
    // This is approximate - real overhead would need to be tracked separately
    const estimatedPolicyOverhead = tokenBreakdown.total;
    const policyOverheadPercent = avgOverheadPerRequest > 0
      ? (estimatedPolicyOverhead / avgOverheadPerRequest) * 100
      : 0;

    return {
      totalRequests: usageSummary.totalRequests,
      totalTokens: usageSummary.totalTokens,
      totalInputTokens: usageSummary.totalInputTokens,
      totalOutputTokens: usageSummary.totalOutputTokens,
      totalCost: usageSummary.totalCostUsd,
      avgInputPerRequest: avgOverheadPerRequest,
      estimatedOverheadCost: (estimatedPolicyOverhead * usageSummary.totalRequests / 1_000_000) * 2.50, // Assume avg $2.50/1M
      policyOverheadPercent,
      requestsPerDay: usageSummary.totalRequests / usageDays,
    };
  }, [usageSummary, tokenBreakdown.total, usageDays]);

  if (loading) {
    return (
      <Flex justify="center" py="40px">
        <Spinner size="xl" color="brand.500" />
      </Flex>
    );
  }

  return (
    <VStack spacing="20px" align="stretch">
      {/* Header */}
      <Card p="20px" bg={cardBg}>
        <HStack spacing="12px" mb="16px">
          <Icon as={MdSpeed} boxSize="32px" color="brand.500" />
          <Box>
            <Text fontSize="lg" fontWeight="600" color={textColor}>
              Policy Token Overhead
            </Text>
            <Text fontSize="sm" color={subtleText}>
              Analyze the token cost of your governance policies across scopes
            </Text>
          </Box>
        </HStack>

        <SimpleGrid columns={{ base: 1, md: 2 }} spacing="16px">
          <FormControl>
            <FormLabel fontSize="sm" color={subtleText}>
              Deployment Context
            </FormLabel>
            <Select
              placeholder="Organization-wide (all deployments)"
              value={selectedDeploymentId}
              onChange={(e) => {
                setSelectedDeploymentId(e.target.value);
                setSelectedEndpointId('');
              }}
            >
              {deployments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </FormControl>

          <FormControl>
            <FormLabel fontSize="sm" color={subtleText}>
              Endpoint Context
            </FormLabel>
            <Select
              placeholder={selectedDeploymentId ? 'All endpoints' : 'Select deployment first'}
              value={selectedEndpointId}
              onChange={(e) => setSelectedEndpointId(e.target.value)}
              isDisabled={!selectedDeploymentId}
            >
              {filteredEndpoints.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name || e.agentId}
                </option>
              ))}
            </Select>
          </FormControl>
        </SimpleGrid>
      </Card>

      {/* Summary Stats */}
      <SimpleGrid columns={{ base: 2, md: 4 }} spacing="20px">
        <Card p="20px" bg={cardBg}>
          <Stat>
            <StatLabel color={subtleText}>Total Overhead</StatLabel>
            <StatNumber color={textColor}>{formatNumber(tokenBreakdown.total)}</StatNumber>
            <StatHelpText>tokens per request</StatHelpText>
          </Stat>
        </Card>

        <Card p="20px" bg={cardBg}>
          <Stat>
            <StatLabel color={subtleText}>Active Policies</StatLabel>
            <StatNumber color={textColor}>
              {effectivePolicies.filter((p) => estimateTokens(getPromptTextFromPolicy(p)) > 0).length}
            </StatNumber>
            <StatHelpText>with token overhead</StatHelpText>
          </Stat>
        </Card>

        <Card p="20px" bg={cardBg}>
          <Stat>
            <StatLabel color={subtleText}>Org-Level</StatLabel>
            <StatNumber color="purple.500">
              {formatNumber(tokenBreakdown.breakdown['organization']?.tokens || 0)}
            </StatNumber>
            <StatHelpText>tokens (always applied)</StatHelpText>
          </Stat>
        </Card>

        <Card p="20px" bg={cardBg}>
          <Stat>
            <StatLabel color={subtleText}>Scoped Policies</StatLabel>
            <StatNumber color="green.500">
              {formatNumber(
                tokenBreakdown.total - (tokenBreakdown.breakdown['organization']?.tokens || 0)
              )}
            </StatNumber>
            <StatHelpText>deployment/endpoint tokens</StatHelpText>
          </Stat>
        </Card>
      </SimpleGrid>

      {/* Scope Breakdown */}
      <Card p="20px" bg={cardBg}>
        <HStack spacing="12px" mb="16px">
          <Icon as={MdDataUsage} color="blue.500" boxSize="24px" />
          <Text fontWeight="600" color={textColor}>
            Token Breakdown by Scope
          </Text>
        </HStack>

        {Object.keys(tokenBreakdown.breakdown).length === 0 ? (
          <Text color={subtleText} textAlign="center" py="20px">
            No policies with token overhead found for this context
          </Text>
        ) : (
          <VStack spacing="12px" align="stretch">
            {SCOPE_ORDER.filter((scope) => tokenBreakdown.breakdown[scope]).map((scope) => {
              const data = tokenBreakdown.breakdown[scope];
              const percentage = (data.tokens / tokenBreakdown.total) * 100;
              const ScopeIcon = SCOPE_ICONS[scope];

              return (
                <Box key={scope}>
                  <HStack justify="space-between" mb="4px">
                    <HStack>
                      <Icon as={ScopeIcon} color={`${SCOPE_COLORS[scope]}.500`} />
                      <Text fontSize="sm" color={textColor} textTransform="capitalize">
                        {scope.replace('_', ' ')}
                      </Text>
                      <Badge colorScheme={SCOPE_COLORS[scope]} fontSize="10px">
                        {data.count} {data.count === 1 ? 'policy' : 'policies'}
                      </Badge>
                    </HStack>
                    <Text fontSize="sm" fontWeight="600" color={textColor}>
                      {formatNumber(data.tokens)} tokens ({percentage.toFixed(1)}%)
                    </Text>
                  </HStack>
                  <Progress
                    value={percentage}
                    size="sm"
                    colorScheme={SCOPE_COLORS[scope]}
                    borderRadius="full"
                  />
                </Box>
              );
            })}
          </VStack>
        )}
      </Card>

      {/* Cost Forecast */}
      <CostForecast
        totalTokens={tokenBreakdown.total}
        cardBg={cardBg}
        textColor={textColor}
        subtleText={subtleText}
      />

      {/* Actual Usage Section */}
      <Card p="20px" bg={cardBg}>
        <HStack spacing="12px" mb="16px" justify="space-between">
          <HStack spacing="12px">
            <Icon as={MdTrendingUp} color="purple.500" boxSize="24px" />
            <Text fontWeight="600" color={textColor}>
              Actual Usage (Last {usageDays} Days)
            </Text>
          </HStack>
          <Select
            w="120px"
            size="sm"
            value={usageDays}
            onChange={(e) => setUsageDays(Number(e.target.value))}
          >
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </Select>
        </HStack>

        {metricsLoading ? (
          <Flex justify="center" py="20px">
            <Spinner size="md" color="brand.500" />
          </Flex>
        ) : actualMetrics ? (
          <VStack spacing="20px" align="stretch">
            <SimpleGrid columns={{ base: 2, md: 4 }} spacing="16px">
              <Stat>
                <StatLabel color={subtleText}>Total Requests</StatLabel>
                <StatNumber color={textColor} fontSize="xl">
                  {formatNumber(actualMetrics.totalRequests)}
                </StatNumber>
                <StatHelpText>{formatNumber(actualMetrics.requestsPerDay)}/day avg</StatHelpText>
              </Stat>

              <Stat>
                <StatLabel color={subtleText}>Total Tokens</StatLabel>
                <StatNumber color={textColor} fontSize="xl">
                  {formatNumber(actualMetrics.totalTokens)}
                </StatNumber>
                <StatHelpText>
                  {formatNumber(actualMetrics.totalInputTokens)} in / {formatNumber(actualMetrics.totalOutputTokens)} out
                </StatHelpText>
              </Stat>

              <Stat>
                <StatLabel color={subtleText}>Actual Cost</StatLabel>
                <StatNumber color="green.500" fontSize="xl">
                  {formatCurrency(actualMetrics.totalCost)}
                </StatNumber>
                <StatHelpText>all usage</StatHelpText>
              </Stat>

              <Stat>
                <StatLabel color={subtleText}>Avg Input/Request</StatLabel>
                <StatNumber color={textColor} fontSize="xl">
                  {formatNumber(actualMetrics.avgInputPerRequest)}
                </StatNumber>
                <StatHelpText>tokens</StatHelpText>
              </Stat>
            </SimpleGrid>

            <Divider />

            {/* Policy Overhead Impact */}
            <Box>
              <HStack justify="space-between" mb="8px">
                <Text fontSize="sm" fontWeight="500" color={textColor}>
                  Estimated Policy Overhead Impact
                </Text>
                <Badge colorScheme={actualMetrics.policyOverheadPercent > 30 ? 'orange' : 'green'}>
                  {actualMetrics.policyOverheadPercent.toFixed(1)}% of input tokens
                </Badge>
              </HStack>
              <Progress
                value={Math.min(actualMetrics.policyOverheadPercent, 100)}
                size="sm"
                colorScheme={actualMetrics.policyOverheadPercent > 30 ? 'orange' : 'green'}
                borderRadius="full"
              />
              <HStack justify="space-between" mt="8px">
                <Text fontSize="xs" color={subtleText}>
                  Policy tokens: {formatNumber(tokenBreakdown.total)} × {formatNumber(actualMetrics.totalRequests)} requests
                </Text>
                <Text fontSize="xs" color={subtleText}>
                  Estimated overhead cost: {formatCurrency(actualMetrics.estimatedOverheadCost)}
                </Text>
              </HStack>
            </Box>

            {/* Usage by Provider */}
            {usageSummary?.byProvider && usageSummary.byProvider.length > 0 && (
              <Box>
                <Text fontSize="sm" fontWeight="500" color={textColor} mb="12px">
                  Usage by Provider
                </Text>
                <SimpleGrid columns={{ base: 1, md: 3 }} spacing="12px">
                  {usageSummary.byProvider.map((provider) => (
                    <Box
                      key={provider.provider}
                      p="12px"
                      borderRadius="8px"
                      border="1px solid"
                      borderColor={borderColor}
                    >
                      <HStack justify="space-between" mb="4px">
                        <Text fontSize="sm" fontWeight="500" color={textColor}>
                          {provider.providerDisplay}
                        </Text>
                        <Badge colorScheme="blue">{formatNumber(provider.totalRequests)} req</Badge>
                      </HStack>
                      <HStack justify="space-between">
                        <Text fontSize="xs" color={subtleText}>
                          {formatNumber(provider.totalTokens)} tokens
                        </Text>
                        <Text fontSize="xs" fontWeight="600" color="green.500">
                          {formatCurrency(provider.totalCostUsd)}
                        </Text>
                      </HStack>
                    </Box>
                  ))}
                </SimpleGrid>
              </Box>
            )}

            {/* Today's Stats */}
            {monitoringStats && (
              <Box p="12px" borderRadius="8px" bg={useColorModeValue('blue.50', 'blue.900')}>
                <HStack spacing="16px" justify="center" flexWrap="wrap">
                  <HStack>
                    <Text fontSize="sm" color={subtleText}>Today:</Text>
                    <Text fontSize="sm" fontWeight="600" color={textColor}>
                      {formatNumber(monitoringStats.interactionsToday)} requests
                    </Text>
                  </HStack>
                  <Text color={subtleText}>•</Text>
                  <HStack>
                    <Text fontSize="sm" color={subtleText}>Tokens:</Text>
                    <Text fontSize="sm" fontWeight="600" color={textColor}>
                      {formatNumber(monitoringStats.totalTokensToday)}
                    </Text>
                  </HStack>
                  <Text color={subtleText}>•</Text>
                  <HStack>
                    <Text fontSize="sm" color={subtleText}>Cost:</Text>
                    <Text fontSize="sm" fontWeight="600" color="green.500">
                      {formatCurrency(monitoringStats.totalCostToday)}
                    </Text>
                  </HStack>
                </HStack>
              </Box>
            )}
          </VStack>
        ) : (
          <Text color={subtleText} textAlign="center" py="20px">
            No usage data available. Start using AI features to see metrics here.
          </Text>
        )}
      </Card>

      {/* Policy Details Table */}
      <Card p="20px" bg={cardBg}>
        <HStack spacing="12px" mb="16px">
          <Icon as={MdTrendingUp} color="orange.500" boxSize="24px" />
          <Text fontWeight="600" color={textColor}>
            Policy Details
          </Text>
        </HStack>

        {effectivePolicies.filter((p) => estimateTokens(getPromptTextFromPolicy(p)) > 0).length ===
        0 ? (
          <Text color={subtleText} textAlign="center" py="20px">
            No policies with token overhead. System prompts and AI guardrails add token overhead.
          </Text>
        ) : (
          <Box overflowX="auto">
            <Table variant="simple" size="sm">
              <Thead>
                <Tr>
                  <Th>Policy</Th>
                  <Th>Scope</Th>
                  <Th>Type</Th>
                  <Th isNumeric>Tokens</Th>
                  <Th w="50px"></Th>
                </Tr>
              </Thead>
              <Tbody>
                {effectivePolicies
                  .filter((p) => estimateTokens(getPromptTextFromPolicy(p)) > 0)
                  .map((policy) => (
                    <PolicyRow
                      key={policy.id}
                      policy={policy}
                      isExpanded={expandedPolicies.has(policy.id)}
                      onToggle={() => togglePolicy(policy.id)}
                      textColor={textColor}
                      subtleText={subtleText}
                    />
                  ))}
              </Tbody>
            </Table>
          </Box>
        )}
      </Card>

      {/* Tips */}
      <Card p="20px" bg={cardBg}>
        <HStack spacing="12px" mb="12px">
          <Icon as={MdCheckCircle} color="green.500" boxSize="24px" />
          <Text fontWeight="600" color={textColor}>
            Optimization Tips
          </Text>
        </HStack>
        <VStack align="stretch" spacing="8px">
          <Text fontSize="sm" color={subtleText}>
            • <strong>Consolidate prompts:</strong> Combine related instructions into fewer policies
          </Text>
          <Text fontSize="sm" color={subtleText}>
            • <strong>Use scope wisely:</strong> Only apply policies at the narrowest necessary scope
          </Text>
          <Text fontSize="sm" color={subtleText}>
            • <strong>Be concise:</strong> Every token in system prompts is sent with every request
          </Text>
          <Text fontSize="sm" color={subtleText}>
            • <strong>Review inheritance:</strong> Check if org-level policies make deployment-level
            ones redundant
          </Text>
          <Text fontSize="sm" color={subtleText}>
            • <strong>Consider model choice:</strong> Cheaper models can offset governance overhead
            costs
          </Text>
        </VStack>
      </Card>
    </VStack>
  );
}
