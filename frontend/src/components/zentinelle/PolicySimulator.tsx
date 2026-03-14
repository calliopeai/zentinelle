'use client';

import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Input,
  Select,
  FormControl,
  FormLabel,
  FormHelperText,
  Textarea,
  Badge,
  Icon,
  Divider,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  useColorModeValue,
  SimpleGrid,
  Flex,
  Spinner,
  Code,
  List,
  ListItem,
  ListIcon,
  NumberInput,
  NumberInputField,
  Collapse,
  Tag,
  TagLabel,
} from '@chakra-ui/react';
import { useQuery } from '@apollo/client';
import { useState, useMemo } from 'react';
import {
  MdPlayArrow,
  MdCheck,
  MdBlock,
  MdWarning,
  MdInfo,
  MdArrowForward,
  MdAccountTree,
  MdSecurity,
  MdAttachMoney,
  MdSpeed,
  MdVerifiedUser,
} from 'react-icons/md';
import { GET_POLICIES } from 'graphql/policies';
import { GET_AI_MODELS } from 'graphql/models';

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

interface SimulationRequest {
  userId: string;
  action: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  context: Record<string, unknown>;
}

interface PolicyMatch {
  policy: Policy;
  matched: boolean;
  result: 'allow' | 'block' | 'audit';
  reason: string;
  details: string[];
}

interface SimulationResult {
  allowed: boolean;
  finalDecision: 'allow' | 'block' | 'audit';
  reason: string;
  policyMatches: PolicyMatch[];
  appliedPolicies: Policy[];
  blockedBy: Policy | null;
  warnings: string[];
  estimatedCost: number;
}

// Simulate policy evaluation (client-side for demo)
function simulatePolicies(
  request: SimulationRequest,
  policies: Policy[]
): SimulationResult {
  const matches: PolicyMatch[] = [];
  const appliedPolicies: Policy[] = [];
  const warnings: string[] = [];
  let blockedBy: Policy | null = null;
  let finalDecision: 'allow' | 'block' | 'audit' = 'allow';

  // Sort by priority (higher first)
  const sortedPolicies = [...policies]
    .filter((p) => p.enabled)
    .sort((a, b) => b.priority - a.priority);

  for (const policy of sortedPolicies) {
    const match = evaluatePolicy(policy, request);
    matches.push(match);

    if (match.matched) {
      appliedPolicies.push(policy);

      if (match.result === 'block' && policy.enforcement === 'enforce') {
        if (!blockedBy) {
          blockedBy = policy;
          finalDecision = 'block';
        }
      } else if (match.result === 'block' && policy.enforcement === 'audit') {
        warnings.push(`Policy "${policy.name}" would block this request (audit mode)`);
        if (finalDecision === 'allow') {
          finalDecision = 'audit';
        }
      }
    }
  }

  // Estimate cost based on model (simplified)
  const modelPrices: Record<string, { input: number; output: number }> = {
    'gpt-4o': { input: 2.5, output: 10 },
    'gpt-4-turbo': { input: 10, output: 30 },
    'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
    'claude-3-opus': { input: 15, output: 75 },
    'claude-3-sonnet': { input: 3, output: 15 },
    'claude-3-haiku': { input: 0.25, output: 1.25 },
  };

  const prices = modelPrices[request.model] || { input: 5, output: 15 };
  const estimatedCost =
    (request.inputTokens / 1000000) * prices.input +
    (request.outputTokens / 1000000) * prices.output;

  return {
    allowed: finalDecision === 'allow',
    finalDecision,
    reason: blockedBy
      ? `Blocked by policy: ${blockedBy.name}`
      : finalDecision === 'audit'
      ? 'Allowed (with audit warnings)'
      : 'All policies passed',
    policyMatches: matches,
    appliedPolicies,
    blockedBy,
    warnings,
    estimatedCost,
  };
}

function evaluatePolicy(policy: Policy, request: SimulationRequest): PolicyMatch {
  const config = policy.config || {};
  const details: string[] = [];
  let matched = false;
  let result: 'allow' | 'block' | 'audit' = 'allow';
  let reason = '';

  switch (policy.policyType) {
    case 'model_restriction': {
      const allowedModels = (config.allowed_models as string[]) || [];
      const blockedModels = (config.blocked_models as string[]) || [];
      const allowedProviders = (config.allowed_providers as string[]) || [];

      if (blockedModels.length > 0 && blockedModels.includes(request.model)) {
        matched = true;
        result = 'block';
        reason = `Model "${request.model}" is blocked`;
        details.push(`Blocked models: ${blockedModels.join(', ')}`);
      } else if (allowedModels.length > 0 && !allowedModels.includes(request.model)) {
        matched = true;
        result = 'block';
        reason = `Model "${request.model}" is not in allowed list`;
        details.push(`Allowed models: ${allowedModels.join(', ')}`);
      } else if (allowedProviders.length > 0) {
        const provider = request.model.split('-')[0];
        if (!allowedProviders.some((p) => request.model.toLowerCase().includes(p.toLowerCase()))) {
          matched = true;
          result = 'block';
          reason = `Provider not allowed`;
          details.push(`Allowed providers: ${allowedProviders.join(', ')}`);
        }
      }

      if (!matched) {
        matched = true;
        result = 'allow';
        reason = 'Model is allowed';
      }
      break;
    }

    case 'rate_limit': {
      const requestsPerMinute = (config.requests_per_minute as number) || 0;
      const tokensPerDay = (config.tokens_per_day as number) || 0;

      matched = true;
      result = 'allow';
      reason = 'Rate limit check (simulated: OK)';
      if (requestsPerMinute > 0) {
        details.push(`Limit: ${requestsPerMinute} req/min`);
      }
      if (tokensPerDay > 0) {
        details.push(`Limit: ${tokensPerDay.toLocaleString()} tokens/day`);
      }
      break;
    }

    case 'budget_limit': {
      const monthlyBudget = (config.monthly_budget_usd as number) || 0;
      const alertThreshold = (config.alert_threshold_percent as number) || 80;

      matched = true;
      result = 'allow';
      reason = 'Budget check (simulated: OK)';
      if (monthlyBudget > 0) {
        details.push(`Monthly budget: $${monthlyBudget}`);
        details.push(`Alert at: ${alertThreshold}%`);
      }
      break;
    }

    case 'context_limit': {
      const maxInputTokens = (config.max_input_tokens as number) || 0;
      const maxOutputTokens = (config.max_output_tokens as number) || 0;

      if (maxInputTokens > 0 && request.inputTokens > maxInputTokens) {
        matched = true;
        result = 'block';
        reason = `Input tokens (${request.inputTokens}) exceed limit (${maxInputTokens})`;
        details.push(`Max input: ${maxInputTokens} tokens`);
      } else if (maxOutputTokens > 0 && request.outputTokens > maxOutputTokens) {
        matched = true;
        result = 'block';
        reason = `Output tokens (${request.outputTokens}) exceed limit (${maxOutputTokens})`;
        details.push(`Max output: ${maxOutputTokens} tokens`);
      } else {
        matched = maxInputTokens > 0 || maxOutputTokens > 0;
        result = 'allow';
        reason = 'Token limits OK';
        if (maxInputTokens > 0) details.push(`Max input: ${maxInputTokens} tokens`);
        if (maxOutputTokens > 0) details.push(`Max output: ${maxOutputTokens} tokens`);
      }
      break;
    }

    case 'ai_guardrail': {
      matched = true;
      result = 'allow';
      reason = 'Content guardrails active (simulated: OK)';
      const blockedTopics = (config.blocked_topics as string[]) || [];
      const piiRedaction = config.pii_redaction as boolean;
      if (blockedTopics.length > 0) {
        details.push(`Blocked topics: ${blockedTopics.join(', ')}`);
      }
      if (piiRedaction) {
        details.push('PII redaction enabled');
      }
      break;
    }

    case 'tool_permission': {
      const allowedTools = (config.allowed_tools as string[]) || [];
      const deniedTools = (config.denied_tools as string[]) || [];
      const requestedTool = (request.context.tool as string) || '';

      if (requestedTool) {
        if (deniedTools.includes(requestedTool)) {
          matched = true;
          result = 'block';
          reason = `Tool "${requestedTool}" is denied`;
        } else if (allowedTools.length > 0 && !allowedTools.includes(requestedTool)) {
          matched = true;
          result = 'block';
          reason = `Tool "${requestedTool}" not in allowed list`;
        } else {
          matched = true;
          result = 'allow';
          reason = 'Tool permitted';
        }
      }
      break;
    }

    case 'human_oversight': {
      const requireApproval = (config.require_approval_for_actions as string[]) || [];
      if (requireApproval.includes(request.action)) {
        matched = true;
        result = 'audit';
        reason = `Action "${request.action}" requires human approval`;
        details.push(`Approval required for: ${requireApproval.join(', ')}`);
      }
      break;
    }

    default: {
      matched = true;
      result = 'allow';
      reason = `Policy type "${policy.policyType}" evaluated (simulated)`;
    }
  }

  return { policy, matched, result, reason, details };
}

export default function PolicySimulator() {
  const cardBg = useColorModeValue('white', 'navy.800');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.200');
  const codeBg = useColorModeValue('gray.50', 'whiteAlpha.100');

  const [request, setRequest] = useState<SimulationRequest>({
    userId: 'user_123',
    action: 'chat',
    model: 'gpt-4o',
    inputTokens: 1000,
    outputTokens: 500,
    context: {},
  });

  const [contextJson, setContextJson] = useState('{\n  "tool": "web_search"\n}');
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  // Fetch policies
  const { data: policiesData, loading: policiesLoading } = useQuery(GET_POLICIES, {
    variables: { first: 100 },
    fetchPolicy: 'cache-first',
  });

  // Fetch models for dropdown
  const { data: modelsData } = useQuery(GET_AI_MODELS, {
    variables: { first: 100, availableOnly: true },
    fetchPolicy: 'cache-first',
  });

  const policies: Policy[] = useMemo(() => {
    return policiesData?.policies?.edges?.map((e: { node: Policy }) => e.node) || [];
  }, [policiesData]);

  const models = useMemo(() => {
    return modelsData?.aiModels?.edges?.map((e: { node: { modelId: string; name: string } }) => e.node) || [];
  }, [modelsData]);

  const handleSimulate = () => {
    setIsSimulating(true);

    // Parse context JSON
    let context = {};
    try {
      context = JSON.parse(contextJson);
    } catch {
      // Invalid JSON, use empty
    }

    // Simulate with slight delay for UX
    setTimeout(() => {
      const simResult = simulatePolicies({ ...request, context }, policies);
      setResult(simResult);
      setIsSimulating(false);
    }, 500);
  };

  const getResultIcon = (r: 'allow' | 'block' | 'audit') => {
    switch (r) {
      case 'allow':
        return MdCheck;
      case 'block':
        return MdBlock;
      case 'audit':
        return MdWarning;
    }
  };

  const getResultColor = (r: 'allow' | 'block' | 'audit') => {
    switch (r) {
      case 'allow':
        return 'green';
      case 'block':
        return 'red';
      case 'audit':
        return 'yellow';
    }
  };

  return (
    <Box>
      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing="24px">
        {/* Request Form */}
        <Box
          p="20px"
          bg={cardBg}
          borderRadius="lg"
          border="1px solid"
          borderColor={borderColor}
        >
          <HStack mb="16px">
            <Icon as={MdPlayArrow} color="brand.500" boxSize="24px" />
            <Text fontWeight="600" fontSize="lg">
              Simulate Request
            </Text>
          </HStack>

          <VStack spacing="16px" align="stretch">
            <SimpleGrid columns={2} spacing="12px">
              <FormControl>
                <FormLabel fontSize="sm">User ID</FormLabel>
                <Input
                  size="sm"
                  value={request.userId}
                  onChange={(e) => setRequest({ ...request, userId: e.target.value })}
                  placeholder="user_123"
                />
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm">Action</FormLabel>
                <Select
                  size="sm"
                  value={request.action}
                  onChange={(e) => setRequest({ ...request, action: e.target.value })}
                >
                  <option value="chat">Chat</option>
                  <option value="tool_call">Tool Call</option>
                  <option value="code_execution">Code Execution</option>
                  <option value="file_write">File Write</option>
                  <option value="network_request">Network Request</option>
                  <option value="database_query">Database Query</option>
                </Select>
              </FormControl>
            </SimpleGrid>

            <FormControl>
              <FormLabel fontSize="sm">Model</FormLabel>
              <Select
                size="sm"
                value={request.model}
                onChange={(e) => setRequest({ ...request, model: e.target.value })}
              >
                {models.length > 0 ? (
                  models.map((m: { modelId: string; name: string }) => (
                    <option key={m.modelId} value={m.modelId}>
                      {m.name}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="gpt-4o">GPT-4o</option>
                    <option value="gpt-4-turbo">GPT-4 Turbo</option>
                    <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                    <option value="claude-3-opus">Claude 3 Opus</option>
                    <option value="claude-3-sonnet">Claude 3 Sonnet</option>
                    <option value="claude-3-haiku">Claude 3 Haiku</option>
                  </>
                )}
              </Select>
            </FormControl>

            <SimpleGrid columns={2} spacing="12px">
              <FormControl>
                <FormLabel fontSize="sm">Input Tokens</FormLabel>
                <NumberInput
                  size="sm"
                  value={request.inputTokens}
                  onChange={(_, val) => setRequest({ ...request, inputTokens: val || 0 })}
                  min={0}
                  max={1000000}
                >
                  <NumberInputField />
                </NumberInput>
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm">Output Tokens</FormLabel>
                <NumberInput
                  size="sm"
                  value={request.outputTokens}
                  onChange={(_, val) => setRequest({ ...request, outputTokens: val || 0 })}
                  min={0}
                  max={100000}
                >
                  <NumberInputField />
                </NumberInput>
              </FormControl>
            </SimpleGrid>

            <FormControl>
              <FormLabel fontSize="sm">Context (JSON)</FormLabel>
              <Textarea
                size="sm"
                value={contextJson}
                onChange={(e) => setContextJson(e.target.value)}
                fontFamily="mono"
                fontSize="xs"
                rows={4}
                bg={codeBg}
              />
              <FormHelperText fontSize="xs">
                Additional context like tool name, database, etc.
              </FormHelperText>
            </FormControl>

            <Button
              colorScheme="brand"
              leftIcon={<Icon as={MdPlayArrow} />}
              onClick={handleSimulate}
              isLoading={isSimulating}
              loadingText="Simulating..."
              isDisabled={policiesLoading}
            >
              Run Simulation
            </Button>

            {policiesLoading && (
              <HStack color="gray.500" fontSize="sm">
                <Spinner size="sm" />
                <Text>Loading policies...</Text>
              </HStack>
            )}
          </VStack>
        </Box>

        {/* Results */}
        <Box
          p="20px"
          bg={cardBg}
          borderRadius="lg"
          border="1px solid"
          borderColor={borderColor}
        >
          <HStack mb="16px">
            <Icon as={MdAccountTree} color="brand.500" boxSize="24px" />
            <Text fontWeight="600" fontSize="lg">
              Simulation Result
            </Text>
          </HStack>

          {!result ? (
            <Flex
              direction="column"
              align="center"
              justify="center"
              py="60px"
              color="gray.500"
            >
              <Icon as={MdPlayArrow} boxSize="48px" mb="12px" />
              <Text>Run a simulation to see results</Text>
              <Text fontSize="sm">Configure your request and click "Run Simulation"</Text>
            </Flex>
          ) : (
            <VStack spacing="16px" align="stretch">
              {/* Final Decision */}
              <Alert
                status={result.finalDecision === 'allow' ? 'success' : result.finalDecision === 'block' ? 'error' : 'warning'}
                borderRadius="md"
              >
                <AlertIcon as={getResultIcon(result.finalDecision)} />
                <Box>
                  <AlertTitle>
                    {result.finalDecision === 'allow'
                      ? 'Request Allowed'
                      : result.finalDecision === 'block'
                      ? 'Request Blocked'
                      : 'Request Allowed (Audit)'}
                  </AlertTitle>
                  <AlertDescription fontSize="sm">{result.reason}</AlertDescription>
                </Box>
              </Alert>

              {/* Warnings */}
              {result.warnings.length > 0 && (
                <Alert status="warning" borderRadius="md">
                  <AlertIcon />
                  <Box>
                    <AlertTitle fontSize="sm">Audit Warnings</AlertTitle>
                    <List spacing="4px" fontSize="sm">
                      {result.warnings.map((w, i) => (
                        <ListItem key={i}>{w}</ListItem>
                      ))}
                    </List>
                  </Box>
                </Alert>
              )}

              {/* Cost Estimate */}
              <HStack
                p="12px"
                bg={codeBg}
                borderRadius="md"
                justify="space-between"
              >
                <HStack>
                  <Icon as={MdAttachMoney} color="green.500" />
                  <Text fontSize="sm" fontWeight="500">
                    Estimated Cost
                  </Text>
                </HStack>
                <Text fontSize="sm" fontWeight="600">
                  ${result.estimatedCost.toFixed(4)}
                </Text>
              </HStack>

              <Divider />

              {/* Policy Trace */}
              <Box>
                <Text fontWeight="600" mb="12px" fontSize="sm">
                  Policy Evaluation Trace
                </Text>
                <Accordion allowMultiple defaultIndex={[0]}>
                  {result.policyMatches
                    .filter((m) => m.matched)
                    .map((match, idx) => (
                      <AccordionItem key={match.policy.id} border="none" mb="8px">
                        <AccordionButton
                          bg={codeBg}
                          borderRadius="md"
                          _hover={{ bg: codeBg }}
                        >
                          <HStack flex="1" spacing="12px">
                            <Icon
                              as={getResultIcon(match.result)}
                              color={`${getResultColor(match.result)}.500`}
                            />
                            <Box textAlign="left">
                              <Text fontSize="sm" fontWeight="500">
                                {match.policy.name}
                              </Text>
                              <Text fontSize="xs" color="gray.500">
                                {match.reason}
                              </Text>
                            </Box>
                          </HStack>
                          <HStack spacing="8px">
                            <Badge
                              colorScheme={getResultColor(match.result)}
                              fontSize="10px"
                            >
                              {match.result.toUpperCase()}
                            </Badge>
                            <Tag size="sm" colorScheme="gray">
                              <TagLabel>P{match.policy.priority}</TagLabel>
                            </Tag>
                            <AccordionIcon />
                          </HStack>
                        </AccordionButton>
                        <AccordionPanel pb="12px" pt="8px">
                          <VStack align="stretch" spacing="8px" fontSize="xs">
                            <HStack>
                              <Text color="gray.500" minW="80px">
                                Type:
                              </Text>
                              <Badge colorScheme="blue">{match.policy.policyType}</Badge>
                            </HStack>
                            <HStack>
                              <Text color="gray.500" minW="80px">
                                Scope:
                              </Text>
                              <Text>{match.policy.scopeName || match.policy.scopeType}</Text>
                            </HStack>
                            <HStack>
                              <Text color="gray.500" minW="80px">
                                Enforcement:
                              </Text>
                              <Badge
                                colorScheme={
                                  match.policy.enforcement === 'enforce'
                                    ? 'red'
                                    : match.policy.enforcement === 'audit'
                                    ? 'yellow'
                                    : 'gray'
                                }
                              >
                                {match.policy.enforcement}
                              </Badge>
                            </HStack>
                            {match.details.length > 0 && (
                              <Box>
                                <Text color="gray.500" mb="4px">
                                  Details:
                                </Text>
                                <List spacing="2px" pl="12px">
                                  {match.details.map((d, i) => (
                                    <ListItem key={i}>
                                      <ListIcon as={MdArrowForward} color="gray.400" />
                                      {d}
                                    </ListItem>
                                  ))}
                                </List>
                              </Box>
                            )}
                          </VStack>
                        </AccordionPanel>
                      </AccordionItem>
                    ))}
                </Accordion>

                {result.policyMatches.filter((m) => m.matched).length === 0 && (
                  <Text fontSize="sm" color="gray.500" textAlign="center" py="20px">
                    No policies matched this request
                  </Text>
                )}
              </Box>
            </VStack>
          )}
        </Box>
      </SimpleGrid>
    </Box>
  );
}
