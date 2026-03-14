'use client';

import {
  Box,
  Text,
  VStack,
  HStack,
  Icon,
  Badge,
  Collapse,
  useDisclosure,
  IconButton,
  Divider,
  List,
  ListItem,
  ListIcon,
  Code,
  useColorModeValue,
} from '@chakra-ui/react';
import {
  MdHelp,
  MdClose,
  MdLightbulb,
  MdWarning,
  MdCheckCircle,
  MdInfo,
  MdSecurity,
  MdSpeed,
  MdAttachMoney,
  MdPerson,
  MdCode,
  MdSmartToy,
  MdMemory,
  MdVisibility,
} from 'react-icons/md';

// Policy type guidance data
const POLICY_GUIDANCE: Record<string, {
  icon: typeof MdSecurity;
  summary: string;
  useCases: string[];
  configTips: string[];
  frameworks: string[];
  bestPractices: string[];
}> = {
  rate_limit: {
    icon: MdSpeed,
    summary: 'Control request frequency to prevent abuse and manage costs.',
    useCases: [
      'Prevent runaway agent loops',
      'Fair usage across teams',
      'Cost control for expensive models',
    ],
    configTips: [
      'Set requests_per_minute based on expected workload',
      'Use burst_limit for handling traffic spikes',
      'Consider different limits for prod vs dev',
    ],
    frameworks: ['SOC2'],
    bestPractices: [
      'Start conservative, increase based on monitoring',
      'Set alerts at 80% of limit',
    ],
  },
  cost_limit: {
    icon: MdAttachMoney,
    summary: 'Set spending limits to prevent unexpected costs.',
    useCases: [
      'Budget enforcement per team/project',
      'Prevent expensive model overuse',
      'Monthly cost caps',
    ],
    configTips: [
      'Set daily_limit and monthly_limit',
      'alert_threshold triggers warnings before hitting limit',
      'reset_day for monthly cycles (1-28)',
    ],
    frameworks: ['SOC2'],
    bestPractices: [
      'Set alerts at 75% and 90% of budget',
      'Review usage weekly',
    ],
  },
  pii_filter: {
    icon: MdPerson,
    summary: 'Detect and handle personally identifiable information.',
    useCases: [
      'HIPAA/GDPR compliance',
      'Prevent data leaks to LLMs',
      'Redact sensitive info in logs',
    ],
    configTips: [
      'detection_types: names, emails, phones, ssn, etc.',
      'action: redact, block, or warn',
      'sensitivity: low, medium, high',
    ],
    frameworks: ['HIPAA', 'GDPR', 'CCPA', 'SOC2'],
    bestPractices: [
      'Use "block" for high-risk deployments',
      'Enable audit logging for compliance',
    ],
  },
  prompt_injection: {
    icon: MdSecurity,
    summary: 'Detect attempts to manipulate AI behavior via malicious prompts.',
    useCases: [
      'Prevent jailbreak attempts',
      'Block system prompt extraction',
      'Protect against adversarial inputs',
    ],
    configTips: [
      'detection_level: basic, standard, strict',
      'action: block, warn, log',
      'custom_patterns for domain-specific threats',
    ],
    frameworks: ['EU_AI_ACT', 'NIST_AI_RMF'],
    bestPractices: [
      'Use "strict" for public-facing agents',
      'Review blocked requests for tuning',
    ],
  },
  system_prompt: {
    icon: MdCode,
    summary: 'Enforce or augment system prompts for AI agents.',
    useCases: [
      'Consistent agent behavior',
      'Add safety instructions',
      'Inject compliance language',
    ],
    configTips: [
      'prompt_text: The prompt content',
      'append_mode: true to add to existing, false to replace',
      'applies_to: chat, lab, or all',
    ],
    frameworks: ['EU_AI_ACT'],
    bestPractices: [
      'Use Prompt Manager for version control',
      'Test prompts before enforcing',
    ],
  },
  model_restriction: {
    icon: MdSmartToy,
    summary: 'Control which AI models can be used.',
    useCases: [
      'Enforce approved model list',
      'Block high-risk models',
      'Cost control via model selection',
    ],
    configTips: [
      'allowed_models: list of model IDs',
      'blocked_models: explicit deny list',
      'fallback_model: default when blocked',
    ],
    frameworks: ['EU_AI_ACT', 'NIST_AI_RMF', 'ISO42001'],
    bestPractices: [
      'Use Model Registry for approvals',
      'Consider risk classification',
    ],
  },
  human_oversight: {
    icon: MdVisibility,
    summary: 'Require human approval for certain actions.',
    useCases: [
      'High-stakes decisions',
      'Financial transactions',
      'Data modifications',
    ],
    configTips: [
      'trigger_actions: list of actions requiring approval',
      'timeout_minutes: auto-deny if no response',
      'approvers: user IDs or roles',
    ],
    frameworks: ['EU_AI_ACT', 'NIST_AI_RMF'],
    bestPractices: [
      'Define clear escalation paths',
      'Set reasonable timeouts',
    ],
  },
  agent_capability: {
    icon: MdSmartToy,
    summary: 'Restrict tools and actions available to agents.',
    useCases: [
      'Sandbox agent permissions',
      'Prevent dangerous tool use',
      'Limit blast radius',
    ],
    configTips: [
      'allowed_tools: whitelist of tool names',
      'blocked_tools: explicit deny list',
      'max_tool_calls: limit per session',
    ],
    frameworks: ['EU_AI_ACT', 'NIST_AI_RMF'],
    bestPractices: [
      'Start with minimal permissions',
      'Log all tool invocations',
    ],
  },
  agent_memory: {
    icon: MdMemory,
    summary: 'Control agent memory and context persistence.',
    useCases: [
      'Data retention compliance',
      'Session isolation',
      'Memory size limits',
    ],
    configTips: [
      'max_memory_items: limit stored context',
      'retention_hours: auto-expire memory',
      'scope: session, user, or global',
    ],
    frameworks: ['GDPR', 'CCPA'],
    bestPractices: [
      'Set retention based on data classification',
      'Enable deletion on request',
    ],
  },
  data_retention: {
    icon: MdVisibility,
    summary: 'Control how long interaction data is kept.',
    useCases: [
      'GDPR compliance',
      'Storage cost management',
      'Audit trail requirements',
    ],
    configTips: [
      'retention_days: days to keep logs',
      'anonymize_after_days: PII removal timing',
      'exclude_patterns: data to never retain',
    ],
    frameworks: ['GDPR', 'CCPA', 'HIPAA'],
    bestPractices: [
      'Balance compliance vs audit needs',
      'Document retention policy',
    ],
  },
  audit_log: {
    icon: MdVisibility,
    summary: 'Configure what gets logged for compliance.',
    useCases: [
      'Compliance evidence',
      'Security monitoring',
      'Usage analytics',
    ],
    configTips: [
      'log_level: minimal, standard, verbose',
      'include_content: whether to log prompts/responses',
      'retention_days: log retention period',
    ],
    frameworks: ['SOC2', 'HIPAA', 'GDPR', 'ISO27001', 'EU_AI_ACT'],
    bestPractices: [
      'Use "verbose" for regulated industries',
      'Set up log forwarding to SIEM',
    ],
  },
};

// Default guidance for unknown policy types
const DEFAULT_GUIDANCE = {
  icon: MdInfo,
  summary: 'Configure this policy to control AI agent behavior.',
  useCases: ['Custom use case - define based on your needs'],
  configTips: ['Review configuration options below'],
  frameworks: [],
  bestPractices: ['Test in non-production first'],
};

interface PolicyHelperProps {
  policyType: string | null;
  isOpen?: boolean;
  onToggle?: () => void;
}

export default function PolicyHelper({
  policyType,
  isOpen: controlledIsOpen,
  onToggle: controlledOnToggle,
}: PolicyHelperProps) {
  const { isOpen, onToggle } = useDisclosure({ defaultIsOpen: true });
  const actualIsOpen = controlledIsOpen !== undefined ? controlledIsOpen : isOpen;
  const actualOnToggle = controlledOnToggle || onToggle;

  const cardBg = useColorModeValue('gray.50', 'navy.900');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.100');
  const textColor = useColorModeValue('gray.700', 'gray.200');
  const mutedColor = useColorModeValue('gray.500', 'gray.400');

  const guidance = policyType
    ? POLICY_GUIDANCE[policyType] || DEFAULT_GUIDANCE
    : null;

  if (!guidance) {
    return (
      <Box
        bg={cardBg}
        borderRadius="12px"
        borderWidth="1px"
        borderColor={borderColor}
        p="16px"
      >
        <HStack spacing="8px" color={mutedColor}>
          <Icon as={MdLightbulb} />
          <Text fontSize="sm">Select a policy type to see guidance</Text>
        </HStack>
      </Box>
    );
  }

  const GuidanceIcon = guidance.icon;

  return (
    <Box
      bg={cardBg}
      borderRadius="12px"
      borderWidth="1px"
      borderColor={borderColor}
      overflow="hidden"
    >
      {/* Header */}
      <HStack
        p="12px 16px"
        justify="space-between"
        cursor="pointer"
        onClick={actualOnToggle}
        _hover={{ bg: useColorModeValue('gray.100', 'whiteAlpha.50') }}
      >
        <HStack spacing="12px">
          <Icon as={MdHelp} color="brand.500" boxSize="20px" />
          <Text fontWeight="600" color={textColor} fontSize="sm">
            Policy Guidance
          </Text>
        </HStack>
        <IconButton
          aria-label="Toggle help"
          icon={<Icon as={actualIsOpen ? MdClose : MdHelp} />}
          size="xs"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            actualOnToggle();
          }}
        />
      </HStack>

      <Collapse in={actualIsOpen}>
        <Box p="16px" pt="0">
          {/* Summary */}
          <HStack spacing="12px" mb="16px" align="flex-start">
            <Box
              p="8px"
              borderRadius="8px"
              bg={useColorModeValue('brand.50', 'whiteAlpha.100')}
            >
              <Icon as={GuidanceIcon} color="brand.500" boxSize="24px" />
            </Box>
            <Text fontSize="sm" color={textColor}>
              {guidance.summary}
            </Text>
          </HStack>

          {/* Framework badges */}
          {guidance.frameworks.length > 0 && (
            <Box mb="16px">
              <Text fontSize="xs" color={mutedColor} mb="8px" fontWeight="500">
                Supports Compliance
              </Text>
              <HStack spacing="6px" flexWrap="wrap">
                {guidance.frameworks.map((fw) => (
                  <Badge key={fw} colorScheme="blue" fontSize="10px">
                    {fw}
                  </Badge>
                ))}
              </HStack>
            </Box>
          )}

          <Divider my="12px" />

          {/* Use Cases */}
          <Box mb="16px">
            <Text fontSize="xs" color={mutedColor} mb="8px" fontWeight="500">
              Common Use Cases
            </Text>
            <List spacing="4px">
              {guidance.useCases.map((use, i) => (
                <ListItem key={i} fontSize="sm" color={textColor}>
                  <ListIcon as={MdCheckCircle} color="green.400" />
                  {use}
                </ListItem>
              ))}
            </List>
          </Box>

          {/* Config Tips */}
          <Box mb="16px">
            <Text fontSize="xs" color={mutedColor} mb="8px" fontWeight="500">
              Configuration Tips
            </Text>
            <VStack align="stretch" spacing="6px">
              {guidance.configTips.map((tip, i) => (
                <HStack key={i} align="flex-start" spacing="8px">
                  <Icon as={MdLightbulb} color="yellow.400" mt="2px" />
                  <Text fontSize="sm" color={textColor}>
                    {tip.includes(':') ? (
                      <>
                        <Code fontSize="xs" mr="4px">
                          {tip.split(':')[0]}
                        </Code>
                        {tip.split(':').slice(1).join(':')}
                      </>
                    ) : (
                      tip
                    )}
                  </Text>
                </HStack>
              ))}
            </VStack>
          </Box>

          {/* Best Practices */}
          <Box>
            <Text fontSize="xs" color={mutedColor} mb="8px" fontWeight="500">
              Best Practices
            </Text>
            <VStack align="stretch" spacing="6px">
              {guidance.bestPractices.map((practice, i) => (
                <HStack key={i} align="flex-start" spacing="8px">
                  <Icon as={MdWarning} color="orange.400" mt="2px" />
                  <Text fontSize="sm" color={textColor}>
                    {practice}
                  </Text>
                </HStack>
              ))}
            </VStack>
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
}
