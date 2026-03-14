'use client';

import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Icon,
  Select,
  useColorModeValue,
  SimpleGrid,
  Flex,
  Spinner,
  Alert,
  AlertIcon,
  Tag,
  TagLabel,
  Tooltip,
  Button,
} from '@chakra-ui/react';
import { useQuery } from '@apollo/client';
import { useState, useMemo } from 'react';
import {
  MdMerge,
  MdAccountTree,
  MdArrowDownward,
  MdCheck,
  MdWarning,
  MdBusiness,
  MdGroup,
  MdCloud,
  MdApi,
  MdPerson,
  MdContentCopy,
  MdRefresh,
} from 'react-icons/md';
import { GET_SYSTEM_PROMPTS, GET_PROMPT_ASSIGNMENTS } from 'graphql/prompts';
import { GET_DEPLOYMENTS } from 'graphql/deployments';
import { GET_AGENT_ENDPOINTS } from 'graphql/agents';

interface PromptAssignment {
  id: string;
  promptId: string;
  promptName: string;
  assignmentType: string;
  targetId: string;
  targetName: string;
  mode: string;
  priority: number;
  templateVariables: Record<string, string>;
  enabled: boolean;
  renderedPrompt: string;
  createdAt: string;
}

interface Deployment {
  id: string;
  name: string;
  slug: string;
}

interface Endpoint {
  id: string;
  name: string;
  slug: string;
  deployment: { id: string; name: string };
}

const ASSIGNMENT_TYPE_ICONS: Record<string, React.ElementType> = {
  organization: MdBusiness,
  team: MdGroup,
  deployment: MdCloud,
  endpoint: MdApi,
  user: MdPerson,
};

const ASSIGNMENT_TYPE_COLORS: Record<string, string> = {
  organization: 'purple',
  team: 'blue',
  deployment: 'green',
  endpoint: 'orange',
  user: 'pink',
};

const PROMPT_TYPE_ORDER = ['safety', 'context', 'persona', 'constraints', 'base'];

interface PromptReconcilerProps {
  deploymentId?: string;
  endpointId?: string;
}

export default function PromptReconciler({ deploymentId, endpointId }: PromptReconcilerProps) {
  const cardBg = useColorModeValue('white', 'navy.800');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.200');
  const codeBg = useColorModeValue('gray.50', 'whiteAlpha.100');
  const highlightBg = useColorModeValue('yellow.50', 'yellow.900');

  const [selectedDeploymentId, setSelectedDeploymentId] = useState(deploymentId || '');
  const [selectedEndpointId, setSelectedEndpointId] = useState(endpointId || '');
  const [copied, setCopied] = useState(false);

  // Fetch deployments for selector
  const { data: deploymentsData, loading: deploymentsLoading } = useQuery(GET_DEPLOYMENTS, {
    variables: { first: 50 },
    fetchPolicy: 'cache-first',
  });

  const deployments: Deployment[] = useMemo(() => {
    return deploymentsData?.deployments?.edges?.map((e: { node: Deployment }) => e.node) || [];
  }, [deploymentsData]);

  // Fetch endpoints for selector (filtered by deployment if selected)
  const { data: endpointsData, loading: endpointsLoading } = useQuery(GET_AGENT_ENDPOINTS, {
    variables: {
      first: 50,
      deploymentId: selectedDeploymentId || undefined,
    },
    fetchPolicy: 'cache-first',
  });

  const endpoints: Endpoint[] = useMemo(() => {
    return endpointsData?.agentEndpoints?.edges?.map((e: { node: Endpoint }) => e.node) || [];
  }, [endpointsData]);

  // Fetch prompt assignments
  const { data: assignmentsData, loading: assignmentsLoading, refetch } = useQuery(GET_PROMPT_ASSIGNMENTS, {
    variables: {
      deploymentId: selectedDeploymentId || undefined,
      endpointId: selectedEndpointId || undefined,
    },
    fetchPolicy: 'cache-and-network',
    skip: !selectedDeploymentId && !selectedEndpointId,
  });

  const assignments: PromptAssignment[] = useMemo(() => {
    const rawAssignments = assignmentsData?.promptAssignments?.edges?.map(
      (e: { node: PromptAssignment }) => e.node
    ) || [];
    // Sort by priority descending
    return rawAssignments.sort((a: PromptAssignment, b: PromptAssignment) => b.priority - a.priority);
  }, [assignmentsData]);

  // Group by assignment type for visualization
  const assignmentsByType = useMemo(() => {
    const groups: Record<string, PromptAssignment[]> = {
      organization: [],
      team: [],
      deployment: [],
      endpoint: [],
      user: [],
    };
    assignments.forEach((a) => {
      const type = a.assignmentType?.toLowerCase() || 'organization';
      if (groups[type]) {
        groups[type].push(a);
      }
    });
    return groups;
  }, [assignments]);

  // Build merged prompt from rendered prompts
  const mergedPrompt = useMemo(() => {
    if (assignments.length === 0) return '';

    // Group by mode/type and join rendered prompts
    const parts: string[] = [];

    // Sort by priority and add rendered prompts
    const sortedAssignments = [...assignments].sort((a, b) => b.priority - a.priority);

    sortedAssignments.forEach((assignment) => {
      if (assignment.renderedPrompt && assignment.enabled) {
        parts.push(`# ${assignment.promptName} (${assignment.assignmentType}, P${assignment.priority})\n${assignment.renderedPrompt}`);
      }
    });

    return parts.join('\n\n---\n\n');
  }, [assignments]);

  // Check for potential issues
  const warnings = useMemo(() => {
    const issues: string[] = [];

    if (assignments.length === 0 && (selectedDeploymentId || selectedEndpointId)) {
      issues.push('No prompts assigned to this context');
    }

    // Check for disabled assignments
    const disabledCount = assignments.filter(a => !a.enabled).length;
    if (disabledCount > 0) {
      issues.push(`${disabledCount} prompt assignment(s) are disabled`);
    }

    return issues;
  }, [assignments, selectedDeploymentId, selectedEndpointId]);

  const handleCopy = () => {
    navigator.clipboard.writeText(mergedPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const loading = deploymentsLoading || endpointsLoading || assignmentsLoading;

  return (
    <Box>
      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing="24px">
        {/* Hierarchy View */}
        <Box
          p="20px"
          bg={cardBg}
          borderRadius="lg"
          border="1px solid"
          borderColor={borderColor}
        >
          <HStack mb="16px" justify="space-between">
            <HStack>
              <Icon as={MdAccountTree} color="brand.500" boxSize="24px" />
              <Text fontWeight="600" fontSize="lg">
                Prompt Hierarchy
              </Text>
            </HStack>
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<MdRefresh />}
              onClick={() => refetch()}
              isLoading={assignmentsLoading}
            >
              Refresh
            </Button>
          </HStack>

          {/* Context Selector */}
          <SimpleGrid columns={2} spacing="12px" mb="16px">
            <Select
              size="sm"
              value={selectedDeploymentId}
              onChange={(e) => {
                setSelectedDeploymentId(e.target.value);
                setSelectedEndpointId(''); // Reset endpoint when deployment changes
              }}
              placeholder="Select Deployment"
              isDisabled={deploymentsLoading}
            >
              {deployments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
            <Select
              size="sm"
              value={selectedEndpointId}
              onChange={(e) => setSelectedEndpointId(e.target.value)}
              placeholder="Select Endpoint"
              isDisabled={endpointsLoading || !selectedDeploymentId}
            >
              {endpoints.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </SimpleGrid>

          {/* Loading State */}
          {loading && (
            <Flex justify="center" py="40px">
              <Spinner size="lg" color="brand.500" />
            </Flex>
          )}

          {/* No Selection State */}
          {!loading && !selectedDeploymentId && !selectedEndpointId && (
            <Alert status="info" borderRadius="md">
              <AlertIcon />
              Select a deployment or endpoint to view prompt assignments
            </Alert>
          )}

          {/* Hierarchy Visualization */}
          {!loading && (selectedDeploymentId || selectedEndpointId) && (
            <VStack spacing="0" align="stretch">
              {(['organization', 'team', 'deployment', 'endpoint', 'user'] as const).map(
                (type, idx) => {
                  const TypeIcon = ASSIGNMENT_TYPE_ICONS[type];
                  const typeAssignments = assignmentsByType[type];
                  const hasAssignments = typeAssignments.length > 0;

                  return (
                    <Box key={type}>
                      {idx > 0 && (
                        <Flex justify="center" py="4px">
                          <Icon as={MdArrowDownward} color="gray.400" />
                        </Flex>
                      )}
                      <Box
                        p="12px"
                        bg={hasAssignments ? `${ASSIGNMENT_TYPE_COLORS[type]}.50` : codeBg}
                        borderRadius="md"
                        border="2px solid"
                        borderColor={hasAssignments ? `${ASSIGNMENT_TYPE_COLORS[type]}.200` : 'transparent'}
                      >
                        <HStack mb={hasAssignments ? '8px' : '0'}>
                          <Icon as={TypeIcon} color={`${ASSIGNMENT_TYPE_COLORS[type]}.500`} />
                          <Text fontWeight="500" fontSize="sm" textTransform="capitalize">
                            {type}
                          </Text>
                          {hasAssignments && (
                            <Badge colorScheme={ASSIGNMENT_TYPE_COLORS[type]} fontSize="10px">
                              {typeAssignments.length} prompt{typeAssignments.length > 1 ? 's' : ''}
                            </Badge>
                          )}
                        </HStack>

                        {hasAssignments && (
                          <VStack spacing="4px" align="stretch" pl="24px">
                            {typeAssignments.map((a) => (
                              <HStack
                                key={a.id}
                                fontSize="xs"
                                justify="space-between"
                                opacity={a.enabled ? 1 : 0.5}
                              >
                                <HStack>
                                  <Tag size="sm" colorScheme={a.enabled ? 'blue' : 'gray'}>
                                    <TagLabel>{a.mode || 'append'}</TagLabel>
                                  </Tag>
                                  <Text>{a.promptName}</Text>
                                  {!a.enabled && (
                                    <Badge colorScheme="gray" fontSize="9px">
                                      disabled
                                    </Badge>
                                  )}
                                </HStack>
                                <Tooltip label={`Priority: ${a.priority}`}>
                                  <Badge variant="outline" fontSize="9px">
                                    P{a.priority}
                                  </Badge>
                                </Tooltip>
                              </HStack>
                            ))}
                          </VStack>
                        )}

                        {!hasAssignments && (
                          <Text fontSize="xs" color="gray.500" pl="24px">
                            No prompts at this level
                          </Text>
                        )}
                      </Box>
                    </Box>
                  );
                }
              )}
            </VStack>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <Box mt="16px">
              {warnings.map((warning, idx) => (
                <Alert key={idx} status="warning" borderRadius="md" mb="8px" fontSize="sm">
                  <AlertIcon />
                  {warning}
                </Alert>
              ))}
            </Box>
          )}
        </Box>

        {/* Merged Prompt Preview */}
        <Box
          p="20px"
          bg={cardBg}
          borderRadius="lg"
          border="1px solid"
          borderColor={borderColor}
        >
          <Flex justify="space-between" align="center" mb="16px">
            <HStack>
              <Icon as={MdMerge} color="brand.500" boxSize="24px" />
              <Text fontWeight="600" fontSize="lg">
                Effective Prompt
              </Text>
            </HStack>
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<Icon as={copied ? MdCheck : MdContentCopy} />}
              onClick={handleCopy}
              colorScheme={copied ? 'green' : 'gray'}
              isDisabled={!mergedPrompt}
            >
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </Flex>

          <Text fontSize="sm" color="gray.500" mb="12px">
            This is the final merged prompt that will be sent to the model:
          </Text>

          <Box
            p="16px"
            bg={codeBg}
            borderRadius="md"
            fontFamily="mono"
            fontSize="xs"
            whiteSpace="pre-wrap"
            maxH="400px"
            overflowY="auto"
          >
            {mergedPrompt || (
              <Text color="gray.500" fontStyle="italic">
                {selectedDeploymentId || selectedEndpointId
                  ? 'No prompts assigned to this context'
                  : 'Select a deployment or endpoint to see the effective prompt'}
              </Text>
            )}
          </Box>

          {/* Merge Order Explanation */}
          <Box mt="16px" p="12px" bg={highlightBg} borderRadius="md">
            <Text fontSize="xs" fontWeight="500" mb="8px">
              Merge Order (by priority, highest first):
            </Text>
            <Text fontSize="xs" color="gray.600">
              Prompts are merged in order of priority (highest first). Organization-level prompts
              provide the base, then team, deployment, endpoint, and user-specific prompts are layered on top.
            </Text>
          </Box>

          {/* Assignment Stats */}
          {assignments.length > 0 && (
            <Box mt="16px">
              <SimpleGrid columns={3} spacing="8px">
                <Box textAlign="center" p="8px" bg={codeBg} borderRadius="md">
                  <Text fontSize="lg" fontWeight="600">{assignments.length}</Text>
                  <Text fontSize="xs" color="gray.500">Total</Text>
                </Box>
                <Box textAlign="center" p="8px" bg={codeBg} borderRadius="md">
                  <Text fontSize="lg" fontWeight="600">{assignments.filter(a => a.enabled).length}</Text>
                  <Text fontSize="xs" color="gray.500">Active</Text>
                </Box>
                <Box textAlign="center" p="8px" bg={codeBg} borderRadius="md">
                  <Text fontSize="lg" fontWeight="600">
                    {Math.max(...assignments.map(a => a.priority), 0)}
                  </Text>
                  <Text fontSize="xs" color="gray.500">Max Priority</Text>
                </Box>
              </SimpleGrid>
            </Box>
          )}
        </Box>
      </SimpleGrid>
    </Box>
  );
}
