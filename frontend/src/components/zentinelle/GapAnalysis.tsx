'use client';

import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Icon,
  Select,
  Input,
  InputGroup,
  InputLeftElement,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Button,
  Tooltip,
  Divider,
  useColorModeValue,
} from '@chakra-ui/react';
import { useState, useMemo } from 'react';
import {
  MdSearch,
  MdWarning,
  MdError,
  MdInfo,
  MdLightbulb,
  MdShield,
  MdBuild,
  MdTimer,
  MdOpenInNew,
} from 'react-icons/md';

interface Gap {
  id: string;
  capability: string;
  capabilityId: string;
  frameworks: string[];
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  remediation: string;
  effort: 'easy' | 'medium' | 'hard';
  policyType?: string;
  ruleType?: string;
}

interface GapAnalysisProps {
  gaps: Gap[];
  onEnableCapability?: (capabilityId: string) => void;
  onCreatePolicy?: (policyType: string) => void;
}

const SEVERITY_CONFIG = {
  critical: { color: 'red', icon: MdError, label: 'Critical', order: 0 },
  high: { color: 'orange', icon: MdWarning, label: 'High', order: 1 },
  medium: { color: 'yellow', icon: MdInfo, label: 'Medium', order: 2 },
  low: { color: 'blue', icon: MdInfo, label: 'Low', order: 3 },
};

const EFFORT_CONFIG = {
  easy: { color: 'green', label: 'Quick Win', time: '< 1 hour' },
  medium: { color: 'yellow', label: 'Moderate', time: '1-4 hours' },
  hard: { color: 'orange', label: 'Complex', time: '> 4 hours' },
};

// Generate gaps from framework coverage data
export function generateGapsFromCoverage(
  frameworkCoverage: Array<{
    id: string;
    name: string;
    missingRequired: string[];
    missingRecommended: string[];
  }>
): Gap[] {
  const gapMap = new Map<string, Gap>();

  // Capability metadata for better descriptions
  const CAPABILITY_META: Record<string, {
    description: string;
    remediation: string;
    effort: 'easy' | 'medium' | 'hard';
    policyType?: string;
    ruleType?: string;
  }> = {
    pii_detection: {
      description: 'Personally Identifiable Information is not being detected in AI interactions',
      remediation: 'Enable the PII Detection content rule to automatically scan for and flag sensitive personal data',
      effort: 'easy',
      ruleType: 'pii_detection',
    },
    phi_detection: {
      description: 'Protected Health Information is not being detected in AI interactions',
      remediation: 'Enable the PHI Detection content rule for HIPAA compliance',
      effort: 'easy',
      ruleType: 'phi_detection',
    },
    secret_detection: {
      description: 'API keys, passwords, and credentials are not being detected',
      remediation: 'Enable Secret Detection to prevent accidental credential exposure',
      effort: 'easy',
      ruleType: 'secret_detection',
    },
    audit_logging: {
      description: 'AI interactions are not being logged for audit purposes',
      remediation: 'Enable the Audit Policy to capture all AI interactions for compliance audits',
      effort: 'easy',
      policyType: 'audit_policy',
    },
    prompt_injection_detection: {
      description: 'Prompt injection attacks are not being detected',
      remediation: 'Enable Prompt Injection Detection to protect against adversarial inputs',
      effort: 'medium',
      ruleType: 'prompt_injection',
    },
    jailbreak_detection: {
      description: 'Jailbreak attempts are not being detected',
      remediation: 'Enable Jailbreak Detection to prevent policy bypass attempts',
      effort: 'medium',
      ruleType: 'jailbreak_attempt',
    },
    cost_tracking: {
      description: 'AI usage costs are not being tracked',
      remediation: 'Enable Budget Limit policy to monitor and control AI spending',
      effort: 'easy',
      policyType: 'budget_limit',
    },
    usage_analytics: {
      description: 'AI usage patterns are not being analyzed',
      remediation: 'Enable usage tracking for visibility into AI consumption patterns',
      effort: 'medium',
    },
    model_tracking: {
      description: 'AI model usage is not being tracked for governance',
      remediation: 'Enable Model Restriction policy to control and monitor model usage',
      effort: 'easy',
      policyType: 'model_restriction',
    },
    content_filtering: {
      description: 'AI outputs are not being filtered for inappropriate content',
      remediation: 'Enable Output Filter policy with appropriate content rules',
      effort: 'medium',
      policyType: 'output_filter',
    },
    rate_limiting: {
      description: 'No rate limits are enforced on AI requests',
      remediation: 'Enable Rate Limit policy to prevent abuse and control costs',
      effort: 'easy',
      policyType: 'rate_limit',
    },
    model_restriction: {
      description: 'AI model usage is not restricted by policy',
      remediation: 'Create a Model Restriction policy to control which models can be used',
      effort: 'easy',
      policyType: 'model_restriction',
    },
    context_limits: {
      description: 'No limits on context window usage',
      remediation: 'Enable Context Limit policy to control token usage',
      effort: 'easy',
      policyType: 'context_limit',
    },
    human_oversight: {
      description: 'High-risk AI actions lack human approval requirements',
      remediation: 'Enable Human Oversight policy for critical operations',
      effort: 'hard',
      policyType: 'human_oversight',
    },
    agent_capability_control: {
      description: 'AI agent capabilities are not restricted',
      remediation: 'Enable Agent Capability policy to control tool access',
      effort: 'medium',
      policyType: 'agent_capability',
    },
    agent_memory_control: {
      description: 'AI agent memory/context is not being controlled',
      remediation: 'Enable Agent Memory policy to manage context retention',
      effort: 'medium',
      policyType: 'agent_memory',
    },
    data_retention: {
      description: 'No data retention policy is configured',
      remediation: 'Enable Data Retention policy to comply with data lifecycle requirements',
      effort: 'medium',
      policyType: 'data_retention',
    },
  };

  // Process missing required capabilities (higher severity)
  frameworkCoverage.forEach((framework) => {
    framework.missingRequired.forEach((capId) => {
      const normalizedId = capId.toLowerCase().replace(/ /g, '_');
      const existing = gapMap.get(normalizedId);
      const meta = CAPABILITY_META[normalizedId] || {
        description: `${capId.replace(/_/g, ' ')} capability is not enabled`,
        remediation: `Enable ${capId.replace(/_/g, ' ')} to improve compliance`,
        effort: 'medium' as const,
      };

      if (existing) {
        if (!existing.frameworks.includes(framework.name)) {
          existing.frameworks.push(framework.name);
          // Upgrade severity if needed
          if (existing.frameworks.length >= 3) {
            existing.severity = 'critical';
          } else if (existing.frameworks.length >= 2 && existing.severity !== 'critical') {
            existing.severity = 'high';
          }
        }
      } else {
        gapMap.set(normalizedId, {
          id: normalizedId,
          capability: capId.replace(/_/g, ' '),
          capabilityId: normalizedId,
          frameworks: [framework.name],
          severity: 'high',
          description: meta.description,
          remediation: meta.remediation,
          effort: meta.effort,
          policyType: meta.policyType,
          ruleType: meta.ruleType,
        });
      }
    });

    // Process missing recommended capabilities (lower severity)
    framework.missingRecommended.forEach((capId) => {
      const normalizedId = capId.toLowerCase().replace(/ /g, '_');
      if (gapMap.has(normalizedId)) return; // Already a required gap

      const meta = CAPABILITY_META[normalizedId] || {
        description: `${capId.replace(/_/g, ' ')} capability is not enabled`,
        remediation: `Enable ${capId.replace(/_/g, ' ')} for enhanced compliance`,
        effort: 'medium' as const,
      };

      const existing = gapMap.get(`rec_${normalizedId}`);
      if (existing) {
        if (!existing.frameworks.includes(framework.name)) {
          existing.frameworks.push(framework.name);
        }
      } else {
        gapMap.set(`rec_${normalizedId}`, {
          id: `rec_${normalizedId}`,
          capability: capId.replace(/_/g, ' '),
          capabilityId: normalizedId,
          frameworks: [framework.name],
          severity: 'medium',
          description: meta.description,
          remediation: meta.remediation,
          effort: meta.effort,
          policyType: meta.policyType,
          ruleType: meta.ruleType,
        });
      }
    });
  });

  return Array.from(gapMap.values());
}

export default function GapAnalysis({
  gaps,
  onEnableCapability,
  onCreatePolicy,
}: GapAnalysisProps) {
  const cardBg = useColorModeValue('white', 'navy.800');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.200');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const hoverBg = useColorModeValue('gray.50', 'whiteAlpha.100');

  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [frameworkFilter, setFrameworkFilter] = useState('');
  const [effortFilter, setEffortFilter] = useState('');

  // Get unique frameworks for filter
  const allFrameworks = useMemo(() => {
    const frameworks = new Set<string>();
    gaps.forEach((gap) => gap.frameworks.forEach((f) => frameworks.add(f)));
    return Array.from(frameworks).sort();
  }, [gaps]);

  // Filter and sort gaps
  const filteredGaps = useMemo(() => {
    return gaps
      .filter((gap) => {
        if (search && !gap.capability.toLowerCase().includes(search.toLowerCase())) {
          return false;
        }
        if (severityFilter && gap.severity !== severityFilter) {
          return false;
        }
        if (frameworkFilter && !gap.frameworks.includes(frameworkFilter)) {
          return false;
        }
        if (effortFilter && gap.effort !== effortFilter) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        // Sort by severity first
        const severityDiff = SEVERITY_CONFIG[a.severity].order - SEVERITY_CONFIG[b.severity].order;
        if (severityDiff !== 0) return severityDiff;
        // Then by number of frameworks affected
        return b.frameworks.length - a.frameworks.length;
      });
  }, [gaps, search, severityFilter, frameworkFilter, effortFilter]);

  // Summary stats
  const criticalCount = gaps.filter((g) => g.severity === 'critical').length;
  const highCount = gaps.filter((g) => g.severity === 'high').length;
  const quickWins = gaps.filter((g) => g.effort === 'easy').length;

  return (
    <Box>
      {/* Summary Bar */}
      <HStack
        spacing="16px"
        p="16px"
        bg={cardBg}
        borderRadius="lg"
        border="1px solid"
        borderColor={borderColor}
        mb="16px"
        flexWrap="wrap"
      >
        <HStack spacing="8px">
          <Icon as={MdError} color="red.500" />
          <Text fontSize="sm" fontWeight="600" color={textColor}>
            {criticalCount} Critical
          </Text>
        </HStack>
        <HStack spacing="8px">
          <Icon as={MdWarning} color="orange.500" />
          <Text fontSize="sm" fontWeight="600" color={textColor}>
            {highCount} High
          </Text>
        </HStack>
        <Divider orientation="vertical" h="20px" />
        <HStack spacing="8px">
          <Icon as={MdLightbulb} color="green.500" />
          <Text fontSize="sm" color="gray.500">
            {quickWins} Quick Wins Available
          </Text>
        </HStack>
        <Text fontSize="sm" color="gray.500" ml="auto">
          {filteredGaps.length} of {gaps.length} gaps shown
        </Text>
      </HStack>

      {/* Filters */}
      <HStack spacing="12px" mb="16px" flexWrap="wrap">
        <InputGroup maxW="250px">
          <InputLeftElement>
            <Icon as={MdSearch} color="gray.400" />
          </InputLeftElement>
          <Input
            placeholder="Search gaps..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            size="sm"
          />
        </InputGroup>
        <Select
          placeholder="All Severities"
          maxW="150px"
          size="sm"
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
        >
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </Select>
        <Select
          placeholder="All Frameworks"
          maxW="180px"
          size="sm"
          value={frameworkFilter}
          onChange={(e) => setFrameworkFilter(e.target.value)}
        >
          {allFrameworks.map((fw) => (
            <option key={fw} value={fw}>
              {fw}
            </option>
          ))}
        </Select>
        <Select
          placeholder="Any Effort"
          maxW="150px"
          size="sm"
          value={effortFilter}
          onChange={(e) => setEffortFilter(e.target.value)}
        >
          <option value="easy">Quick Wins</option>
          <option value="medium">Moderate</option>
          <option value="hard">Complex</option>
        </Select>
      </HStack>

      {/* Gap List */}
      {filteredGaps.length === 0 ? (
        <Box
          p="40px"
          bg={cardBg}
          borderRadius="lg"
          border="1px solid"
          borderColor={borderColor}
          textAlign="center"
        >
          <Icon as={MdShield} boxSize="48px" color="green.500" mb="16px" />
          <Text fontSize="lg" fontWeight="600" color={textColor} mb="8px">
            No Gaps Found
          </Text>
          <Text color="gray.500">
            {gaps.length === 0
              ? 'All compliance requirements are met!'
              : 'No gaps match your current filters'}
          </Text>
        </Box>
      ) : (
        <Accordion allowMultiple>
          {filteredGaps.map((gap) => {
            const severity = SEVERITY_CONFIG[gap.severity];
            const effort = EFFORT_CONFIG[gap.effort];

            return (
              <AccordionItem
                key={gap.id}
                border="1px solid"
                borderColor={borderColor}
                borderRadius="lg"
                mb="8px"
                overflow="hidden"
              >
                <AccordionButton
                  py="12px"
                  px="16px"
                  _hover={{ bg: hoverBg }}
                  _expanded={{ bg: hoverBg }}
                >
                  <HStack flex="1" spacing="12px">
                    <Icon as={severity.icon} color={`${severity.color}.500`} boxSize="20px" />
                    <VStack align="start" spacing="2px" flex="1">
                      <HStack spacing="8px">
                        <Text fontWeight="600" color={textColor} fontSize="sm">
                          {gap.capability}
                        </Text>
                        <Badge colorScheme={severity.color} fontSize="10px">
                          {severity.label}
                        </Badge>
                        <Badge colorScheme={effort.color} variant="outline" fontSize="10px">
                          {effort.label}
                        </Badge>
                      </HStack>
                      <HStack spacing="4px">
                        {gap.frameworks.slice(0, 3).map((fw) => (
                          <Badge key={fw} colorScheme="gray" fontSize="9px">
                            {fw}
                          </Badge>
                        ))}
                        {gap.frameworks.length > 3 && (
                          <Badge colorScheme="gray" fontSize="9px">
                            +{gap.frameworks.length - 3}
                          </Badge>
                        )}
                      </HStack>
                    </VStack>
                  </HStack>
                  <AccordionIcon />
                </AccordionButton>
                <AccordionPanel pb="16px" px="16px" bg={cardBg}>
                  <VStack align="stretch" spacing="12px">
                    <Box>
                      <Text fontSize="xs" fontWeight="500" color="gray.500" mb="4px">
                        Issue
                      </Text>
                      <Text fontSize="sm" color={textColor}>
                        {gap.description}
                      </Text>
                    </Box>
                    <Box>
                      <HStack mb="4px">
                        <Icon as={MdLightbulb} color="yellow.500" boxSize="14px" />
                        <Text fontSize="xs" fontWeight="500" color="gray.500">
                          Remediation
                        </Text>
                      </HStack>
                      <Text fontSize="sm" color={textColor}>
                        {gap.remediation}
                      </Text>
                    </Box>
                    <HStack justify="space-between" pt="8px">
                      <HStack spacing="8px">
                        <Tooltip label={effort.time}>
                          <HStack spacing="4px" cursor="help">
                            <Icon as={MdTimer} color="gray.400" boxSize="14px" />
                            <Text fontSize="xs" color="gray.500">
                              {effort.time}
                            </Text>
                          </HStack>
                        </Tooltip>
                        <Text fontSize="xs" color="gray.400">•</Text>
                        <Text fontSize="xs" color="gray.500">
                          Affects {gap.frameworks.length} framework{gap.frameworks.length > 1 ? 's' : ''}
                        </Text>
                      </HStack>
                      <HStack spacing="8px">
                        {gap.policyType && onCreatePolicy && (
                          <Button
                            size="xs"
                            variant="outline"
                            colorScheme="brand"
                            leftIcon={<MdBuild />}
                            onClick={() => onCreatePolicy(gap.policyType!)}
                          >
                            Create Policy
                          </Button>
                        )}
                        {onEnableCapability && (
                          <Button
                            size="xs"
                            colorScheme="brand"
                            leftIcon={<MdOpenInNew />}
                            onClick={() => onEnableCapability(gap.capabilityId)}
                          >
                            Enable
                          </Button>
                        )}
                      </HStack>
                    </HStack>
                  </VStack>
                </AccordionPanel>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </Box>
  );
}
