'use client';

import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Icon,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Progress,
  Divider,
  Button,
  Spinner,
  useColorModeValue,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  List,
  ListItem,
  ListIcon,
  Tooltip,
  Flex,
  CircularProgress,
  CircularProgressLabel,
} from '@chakra-ui/react';
import { useQuery } from '@apollo/client';
import { useMemo } from 'react';
import {
  MdCheckCircle,
  MdWarning,
  MdError,
  MdInfo,
  MdSecurity,
  MdSpeed,
  MdAttachMoney,
  MdShield,
  MdPlayArrow,
} from 'react-icons/md';
import { GET_POLICIES } from 'graphql/policies';

interface Policy {
  id: string;
  name: string;
  policyType: string;
  scopeType: string;
  scopeName: string;
  config: Record<string, unknown>;
  priority: number;
  enabled: boolean;
  enforcement: string;
}

interface AnalysisResult {
  score: number;
  issues: Array<{
    type: 'error' | 'warning' | 'info';
    title: string;
    description: string;
    policyId?: string;
    policyName?: string;
  }>;
  coverage: {
    category: string;
    covered: boolean;
    policies: string[];
  }[];
  conflicts: Array<{
    policies: string[];
    description: string;
  }>;
}

// Policy categories and what they protect
const POLICY_CATEGORIES = {
  'AI Safety': {
    icon: MdSecurity,
    color: 'purple',
    policies: ['ai_guardrail', 'output_filter', 'system_prompt'],
    description: 'Content filtering and AI behavior controls',
  },
  'Cost Control': {
    icon: MdAttachMoney,
    color: 'green',
    policies: ['budget_limit', 'rate_limit', 'model_restriction'],
    description: 'Budget and resource limits',
  },
  'Security': {
    icon: MdShield,
    color: 'red',
    policies: ['network_policy', 'secret_access', 'data_access', 'tool_permission'],
    description: 'Access controls and security policies',
  },
  'Performance': {
    icon: MdSpeed,
    color: 'blue',
    policies: ['context_limit', 'resource_quota', 'agent_capability'],
    description: 'Resource and performance constraints',
  },
  'Compliance': {
    icon: MdCheckCircle,
    color: 'orange',
    policies: ['audit_policy', 'session_policy', 'data_retention', 'human_oversight'],
    description: 'Audit trails and compliance controls',
  },
};

function analyzePolicies(policies: Policy[]): AnalysisResult {
  const issues: AnalysisResult['issues'] = [];
  const conflicts: AnalysisResult['conflicts'] = [];

  // Check coverage
  const policyTypes = new Set(policies.filter(p => p.enabled).map(p => p.policyType));
  const coverage: AnalysisResult['coverage'] = Object.entries(POLICY_CATEGORIES).map(
    ([category, info]) => ({
      category,
      covered: info.policies.some(type => policyTypes.has(type)),
      policies: policies
        .filter(p => p.enabled && info.policies.includes(p.policyType))
        .map(p => p.name),
    })
  );

  // Check for missing critical policies
  if (!policyTypes.has('rate_limit') && !policyTypes.has('budget_limit')) {
    issues.push({
      type: 'warning',
      title: 'No cost controls configured',
      description:
        'Consider adding rate limits or budget limits to prevent unexpected costs.',
    });
  }

  if (!policyTypes.has('audit_policy')) {
    issues.push({
      type: 'info',
      title: 'Audit logging not configured',
      description:
        'Enable audit policies for compliance and debugging visibility.',
    });
  }

  if (!policyTypes.has('ai_guardrail') && !policyTypes.has('output_filter')) {
    issues.push({
      type: 'warning',
      title: 'No AI safety guardrails',
      description:
        'Consider adding content filtering to prevent unwanted AI outputs.',
    });
  }

  // Check for conflicting policies
  const enabledPolicies = policies.filter(p => p.enabled);

  // Check for overlapping model restrictions with different rules
  const modelRestrictions = enabledPolicies.filter(
    p => p.policyType === 'model_restriction'
  );
  if (modelRestrictions.length > 1) {
    // Check if they have conflicting allowed_models
    const configs = modelRestrictions.map(p => ({
      name: p.name,
      allowed: (p.config.allowed_models as string[]) || [],
      blocked: (p.config.blocked_models as string[]) || [],
    }));

    // Look for models that are both allowed and blocked
    for (const config of configs) {
      const overlap = config.allowed.filter(m =>
        configs.some(c => c.name !== config.name && c.blocked.includes(m))
      );
      if (overlap.length > 0) {
        conflicts.push({
          policies: modelRestrictions.map(p => p.name),
          description: `Model(s) ${overlap.join(', ')} are allowed by one policy but blocked by another`,
        });
      }
    }
  }

  // Check for conflicting rate limits
  const rateLimits = enabledPolicies.filter(p => p.policyType === 'rate_limit');
  if (rateLimits.length > 1) {
    // Same scope with different limits
    const scopes = new Map<string, Policy[]>();
    for (const policy of rateLimits) {
      const key = `${policy.scopeType}-${policy.scopeName}`;
      if (!scopes.has(key)) scopes.set(key, []);
      scopes.get(key)!.push(policy);
    }
    for (const [, scopePolicies] of scopes) {
      if (scopePolicies.length > 1) {
        issues.push({
          type: 'warning',
          title: 'Multiple rate limits on same scope',
          description: `Policies "${scopePolicies.map(p => p.name).join('", "')}" have overlapping scope. Higher priority will take precedence.`,
        });
      }
    }
  }

  // Check for disabled but important policies
  const disabledSecurity = policies.filter(
    p => !p.enabled && ['secret_access', 'data_access', 'network_policy'].includes(p.policyType)
  );
  for (const policy of disabledSecurity) {
    issues.push({
      type: 'info',
      title: `Security policy "${policy.name}" is disabled`,
      description: 'This policy is not currently enforced.',
      policyId: policy.id,
      policyName: policy.name,
    });
  }

  // Calculate score
  const coverageScore = (coverage.filter(c => c.covered).length / coverage.length) * 40;
  const issueDeductions = issues.reduce((acc, issue) => {
    if (issue.type === 'error') return acc + 20;
    if (issue.type === 'warning') return acc + 10;
    return acc + 2;
  }, 0);
  const conflictDeductions = conflicts.length * 15;
  const score = Math.max(0, Math.min(100, 60 + coverageScore - issueDeductions - conflictDeductions));

  return { score, issues, coverage, conflicts };
}

interface PolicyAnalyzerProps {
  organizationId?: string;
}

export default function PolicyAnalyzer({ organizationId }: PolicyAnalyzerProps) {
  const cardBg = useColorModeValue('white', 'navy.800');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.200');

  const { data, loading, error, refetch } = useQuery(GET_POLICIES, {
    variables: { first: 100 },
    fetchPolicy: 'cache-and-network',
  });

  const policies: Policy[] = useMemo(() => {
    return data?.policies?.edges?.map((e: { node: Policy }) => e.node) || [];
  }, [data]);

  const analysis = useMemo(() => analyzePolicies(policies), [policies]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'green';
    if (score >= 60) return 'yellow';
    if (score >= 40) return 'orange';
    return 'red';
  };

  if (loading && !data) {
    return (
      <Flex justify="center" p="40px">
        <Spinner size="xl" color="brand.500" />
      </Flex>
    );
  }

  if (error) {
    return (
      <Alert status="error">
        <AlertIcon />
        <AlertDescription>Failed to load policies for analysis</AlertDescription>
      </Alert>
    );
  }

  return (
    <Box>
      {/* Score Overview */}
      <SimpleGrid columns={{ base: 1, md: 4 }} spacing="16px" mb="24px">
        <Box
          p="20px"
          bg={cardBg}
          borderRadius="lg"
          border="1px solid"
          borderColor={borderColor}
          textAlign="center"
        >
          <CircularProgress
            value={analysis.score}
            size="100px"
            thickness="8px"
            color={`${getScoreColor(analysis.score)}.400`}
          >
            <CircularProgressLabel fontSize="xl" fontWeight="bold">
              {analysis.score}
            </CircularProgressLabel>
          </CircularProgress>
          <Text fontWeight="600" mt="8px">
            Policy Score
          </Text>
          <Text fontSize="sm" color="gray.500">
            {analysis.score >= 80
              ? 'Excellent'
              : analysis.score >= 60
              ? 'Good'
              : analysis.score >= 40
              ? 'Needs Improvement'
              : 'Critical'}
          </Text>
        </Box>

        <Stat
          p="20px"
          bg={cardBg}
          borderRadius="lg"
          border="1px solid"
          borderColor={borderColor}
        >
          <StatLabel>Active Policies</StatLabel>
          <StatNumber>{policies.filter(p => p.enabled).length}</StatNumber>
          <StatHelpText>{policies.length} total</StatHelpText>
        </Stat>

        <Stat
          p="20px"
          bg={cardBg}
          borderRadius="lg"
          border="1px solid"
          borderColor={borderColor}
        >
          <StatLabel>Issues Found</StatLabel>
          <StatNumber color={analysis.issues.length > 0 ? 'orange.500' : 'green.500'}>
            {analysis.issues.length}
          </StatNumber>
          <StatHelpText>
            {analysis.issues.filter(i => i.type === 'error').length} errors,{' '}
            {analysis.issues.filter(i => i.type === 'warning').length} warnings
          </StatHelpText>
        </Stat>

        <Stat
          p="20px"
          bg={cardBg}
          borderRadius="lg"
          border="1px solid"
          borderColor={borderColor}
        >
          <StatLabel>Conflicts</StatLabel>
          <StatNumber color={analysis.conflicts.length > 0 ? 'red.500' : 'green.500'}>
            {analysis.conflicts.length}
          </StatNumber>
          <StatHelpText>Policy rule conflicts</StatHelpText>
        </Stat>
      </SimpleGrid>

      {/* Coverage Analysis */}
      <Box
        p="20px"
        bg={cardBg}
        borderRadius="lg"
        border="1px solid"
        borderColor={borderColor}
        mb="24px"
      >
        <Text fontWeight="600" mb="16px">
          Coverage Analysis
        </Text>
        <SimpleGrid columns={{ base: 1, md: 5 }} spacing="12px">
          {analysis.coverage.map((cat) => {
            const categoryInfo = POLICY_CATEGORIES[cat.category as keyof typeof POLICY_CATEGORIES];
            return (
              <Tooltip
                key={cat.category}
                label={
                  cat.covered
                    ? `Protected by: ${cat.policies.join(', ')}`
                    : categoryInfo.description
                }
              >
                <Box
                  p="12px"
                  borderRadius="md"
                  border="2px solid"
                  borderColor={cat.covered ? `${categoryInfo.color}.400` : 'gray.200'}
                  bg={cat.covered ? `${categoryInfo.color}.50` : 'transparent'}
                  textAlign="center"
                  cursor="pointer"
                >
                  <Icon
                    as={categoryInfo.icon}
                    boxSize="24px"
                    color={cat.covered ? `${categoryInfo.color}.500` : 'gray.400'}
                  />
                  <Text
                    fontSize="sm"
                    fontWeight="500"
                    mt="4px"
                    color={cat.covered ? `${categoryInfo.color}.700` : 'gray.500'}
                  >
                    {cat.category}
                  </Text>
                  <Badge
                    colorScheme={cat.covered ? categoryInfo.color : 'gray'}
                    fontSize="10px"
                    mt="4px"
                  >
                    {cat.covered ? `${cat.policies.length} active` : 'Not covered'}
                  </Badge>
                </Box>
              </Tooltip>
            );
          })}
        </SimpleGrid>
      </Box>

      {/* Issues & Conflicts */}
      {(analysis.issues.length > 0 || analysis.conflicts.length > 0) && (
        <Box
          p="20px"
          bg={cardBg}
          borderRadius="lg"
          border="1px solid"
          borderColor={borderColor}
          mb="24px"
        >
          <Text fontWeight="600" mb="16px">
            Issues & Recommendations
          </Text>
          <VStack spacing="12px" align="stretch">
            {analysis.conflicts.map((conflict, idx) => (
              <Alert key={`conflict-${idx}`} status="error" borderRadius="md">
                <AlertIcon as={MdError} />
                <Box>
                  <AlertTitle fontSize="sm">Policy Conflict</AlertTitle>
                  <AlertDescription fontSize="sm">
                    {conflict.description}
                    <Text fontSize="xs" color="gray.500" mt="4px">
                      Affected: {conflict.policies.join(', ')}
                    </Text>
                  </AlertDescription>
                </Box>
              </Alert>
            ))}
            {analysis.issues.map((issue, idx) => (
              <Alert
                key={`issue-${idx}`}
                status={issue.type === 'error' ? 'error' : issue.type === 'warning' ? 'warning' : 'info'}
                borderRadius="md"
              >
                <AlertIcon />
                <Box>
                  <AlertTitle fontSize="sm">{issue.title}</AlertTitle>
                  <AlertDescription fontSize="sm">{issue.description}</AlertDescription>
                </Box>
              </Alert>
            ))}
          </VStack>
        </Box>
      )}

      {/* Simulation CTA */}
      <Box
        p="20px"
        bg={cardBg}
        borderRadius="lg"
        border="1px solid"
        borderColor={borderColor}
      >
        <Flex justify="space-between" align="center">
          <Box>
            <Text fontWeight="600">Policy Simulator</Text>
            <Text fontSize="sm" color="gray.500">
              Test policies against sample requests before deploying
            </Text>
          </Box>
          <Tooltip
            label="Policy simulation allows you to test how your policies will handle different scenarios. Coming soon with interactive testing."
            hasArrow
          >
            <Button
              leftIcon={<Icon as={MdPlayArrow} />}
              colorScheme="gray"
              variant="outline"
            >
              Coming Soon
            </Button>
          </Tooltip>
        </Flex>
      </Box>
    </Box>
  );
}
