'use client';

import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Icon,
  Button,
  Collapse,
  Tooltip,
  IconButton,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  SimpleGrid,
  Divider,
  Tag,
  TagLabel,
  Wrap,
  WrapItem,
  useColorModeValue,
  useDisclosure,
  Flex,
  Code,
  Spinner,
  Alert,
  AlertIcon,
} from '@chakra-ui/react';
import { useQuery } from '@apollo/client';
import { useState, useMemo } from 'react';
import {
  MdBusiness,
  MdGroup,
  MdCloud,
  MdSmartToy,
  MdPerson,
  MdExpandMore,
  MdExpandLess,
  MdPolicy,
  MdVisibility,
  MdArrowForward,
  MdCheck,
  MdClose,
  MdRemove,
  MdKeyboardArrowRight,
  MdKeyboardArrowDown,
  MdLayers,
  MdCompareArrows,
  MdRefresh,
} from 'react-icons/md';
import Card from 'components/card/Card';
import { GET_MY_ORGANIZATION } from 'graphql/organization';
import { GET_DEPLOYMENTS } from 'graphql/deployments';
import { GET_AGENTS } from 'graphql/agents';
import { GET_POLICIES_FOR_HIERARCHY } from 'graphql/policies';

type HierarchyLevel = 'organization' | 'sub_organization' | 'deployment' | 'endpoint' | 'user';

interface Policy {
  id: string;
  name: string;
  description: string;
  policyType: string;
  scopeType: string;
  scopeName: string;
  config: Record<string, any>;
  priority: number;
  enforcement: string;
  enabled: boolean;
}

interface PolicyConfig {
  id: string;
  name: string;
  type: string;
  value: any;
  inherited: boolean;
  inheritedFrom?: HierarchyLevel;
  overridden: boolean;
  overriddenAt?: HierarchyLevel;
}

interface HierarchyNode {
  id: string;
  name: string;
  level: HierarchyLevel;
  policies: PolicyConfig[];
  children: HierarchyNode[];
  effectivePolicies?: PolicyConfig[];
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
  deploymentName: string;
}

interface PolicyHierarchyProps {
  selectedEndpointId?: string;
  selectedUserId?: string;
}

// Convert backend policy to PolicyConfig
function policyToConfig(policy: Policy): PolicyConfig {
  return {
    id: policy.id,
    name: policy.name,
    type: policy.policyType,
    value: policy.config,
    inherited: false,
    overridden: false,
  };
}

// Calculate effective policies at a node by merging parent policies
function calculateEffectivePolicies(node: HierarchyNode, parentPolicies: PolicyConfig[] = []): PolicyConfig[] {
  const effectiveMap = new Map<string, PolicyConfig>();

  // Add parent policies first (inherited)
  parentPolicies.forEach((p) => {
    effectiveMap.set(p.type, { ...p, inherited: true, inheritedFrom: p.inheritedFrom || (p.inherited ? p.inheritedFrom : undefined) });
  });

  // Override with node's own policies
  node.policies.forEach((p) => {
    const existing = effectiveMap.get(p.type);
    if (existing) {
      effectiveMap.set(p.type, { ...p, overridden: true, overriddenAt: existing.inheritedFrom || 'organization' });
    } else {
      effectiveMap.set(p.type, p);
    }
  });

  return Array.from(effectiveMap.values());
}

const levelIcons: Record<HierarchyLevel, any> = {
  organization: MdBusiness,
  sub_organization: MdGroup,
  deployment: MdCloud,
  endpoint: MdSmartToy,
  user: MdPerson,
};

const levelColors: Record<HierarchyLevel, string> = {
  organization: 'purple',
  sub_organization: 'blue',
  deployment: 'green',
  endpoint: 'orange',
  user: 'pink',
};

const levelLabels: Record<HierarchyLevel, string> = {
  organization: 'Organization',
  sub_organization: 'Team',
  deployment: 'Deployment',
  endpoint: 'Endpoint',
  user: 'User',
};

interface TreeNodeProps {
  node: HierarchyNode;
  depth: number;
  parentPolicies: PolicyConfig[];
  onSelectNode: (node: HierarchyNode, effectivePolicies: PolicyConfig[]) => void;
  selectedNodeId: string | null;
}

function TreeNode({ node, depth, parentPolicies, onSelectNode, selectedNodeId }: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;

  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.200');
  const hoverBg = useColorModeValue('gray.50', 'whiteAlpha.100');
  const selectedBg = useColorModeValue('brand.50', 'whiteAlpha.200');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const subtleText = useColorModeValue('gray.500', 'gray.400');
  const lineBg = useColorModeValue('gray.300', 'whiteAlpha.300');

  const effectivePolicies = useMemo(
    () => calculateEffectivePolicies(node, parentPolicies),
    [node, parentPolicies]
  );

  const isSelected = selectedNodeId === node.id;

  return (
    <Box>
      <HStack
        spacing="0"
        pl={`${depth * 24}px`}
        py="8px"
        pr="12px"
        bg={isSelected ? selectedBg : undefined}
        _hover={{ bg: isSelected ? selectedBg : hoverBg }}
        cursor="pointer"
        borderRadius="md"
        onClick={() => onSelectNode(node, effectivePolicies)}
      >
        {/* Expand/Collapse Button */}
        <Box w="24px">
          {hasChildren && (
            <IconButton
              aria-label="Toggle"
              icon={isExpanded ? <MdKeyboardArrowDown /> : <MdKeyboardArrowRight />}
              size="xs"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
            />
          )}
        </Box>

        {/* Node Icon */}
        <Flex
          w="28px"
          h="28px"
          bg={`${levelColors[node.level]}.500`}
          borderRadius="6px"
          align="center"
          justify="center"
          mr="12px"
        >
          <Icon as={levelIcons[node.level]} color="white" boxSize="16px" />
        </Flex>

        {/* Node Info */}
        <VStack align="start" spacing="0" flex="1">
          <HStack spacing="8px">
            <Text fontSize="sm" fontWeight="500" color={textColor}>
              {node.name}
            </Text>
            <Badge colorScheme={levelColors[node.level]} fontSize="10px">
              {levelLabels[node.level]}
            </Badge>
          </HStack>
          <HStack spacing="8px">
            <Text fontSize="xs" color={subtleText}>
              {node.policies.length} direct, {effectivePolicies.length} effective
            </Text>
            {node.policies.some((p) => p.overridden) && (
              <Badge colorScheme="yellow" fontSize="9px">overrides</Badge>
            )}
          </HStack>
        </VStack>

        {/* Policy Count Badge */}
        {effectivePolicies.length > 0 && (
          <Badge colorScheme="brand" borderRadius="full" px="8px">
            {effectivePolicies.length}
          </Badge>
        )}
      </HStack>

      {/* Children */}
      <Collapse in={isExpanded}>
        <Box
          ml={`${depth * 24 + 12}px`}
          borderLeft="2px solid"
          borderColor={lineBg}
        >
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              parentPolicies={effectivePolicies}
              onSelectNode={onSelectNode}
              selectedNodeId={selectedNodeId}
            />
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}

export default function PolicyHierarchy({ selectedEndpointId, selectedUserId }: PolicyHierarchyProps) {
  const cardBg = useColorModeValue('white', 'navy.800');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.200');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const subtleText = useColorModeValue('gray.500', 'gray.400');
  const codeBg = useColorModeValue('gray.50', 'whiteAlpha.100');

  const [selectedNode, setSelectedNode] = useState<HierarchyNode | null>(null);
  const [effectivePolicies, setEffectivePolicies] = useState<PolicyConfig[]>([]);

  const { isOpen, onOpen, onClose } = useDisclosure();

  // Fetch organization
  const { data: orgData, loading: orgLoading } = useQuery(GET_MY_ORGANIZATION, {
    fetchPolicy: 'cache-first',
  });

  // Fetch deployments
  const { data: deploymentsData, loading: deploymentsLoading, refetch: refetchDeployments } = useQuery(GET_DEPLOYMENTS, {
    variables: { first: 100 },
    fetchPolicy: 'cache-and-network',
  });

  // Fetch endpoints
  const { data: endpointsData, loading: endpointsLoading, refetch: refetchEndpoints } = useQuery(GET_AGENTS, {
    variables: { first: 200 },
    fetchPolicy: 'cache-and-network',
  });

  // Fetch policies
  const { data: policiesData, loading: policiesLoading, refetch: refetchPolicies } = useQuery(GET_POLICIES_FOR_HIERARCHY, {
    variables: { first: 100 },
    fetchPolicy: 'cache-and-network',
  });

  // Build hierarchy from real data
  const hierarchy = useMemo<HierarchyNode | null>(() => {
    if (!orgData?.myOrganization) return null;

    const org = orgData.myOrganization;
    const deployments: Deployment[] = deploymentsData?.deployments?.edges?.map((e: { node: Deployment }) => e.node) || [];
    const endpoints: Endpoint[] = endpointsData?.endpoints?.edges?.map((e: { node: Endpoint }) => e.node) || [];
    const policies: Policy[] = policiesData?.policies?.edges?.map((e: { node: Policy }) => e.node) || [];

    // Group policies by scope type
    const policiesByScope: Record<string, Policy[]> = {
      organization: [],
      sub_organization: [],
      deployment: [],
      endpoint: [],
      user: [],
    };

    policies.forEach((p) => {
      const scope = p.scopeType?.toLowerCase() || 'organization';
      if (policiesByScope[scope]) {
        policiesByScope[scope].push(p);
      }
    });

    // Group endpoints by deployment
    const endpointsByDeployment: Record<string, Endpoint[]> = {};
    endpoints.forEach((ep) => {
      const depName = ep.deploymentName || 'unassigned';
      if (!endpointsByDeployment[depName]) {
        endpointsByDeployment[depName] = [];
      }
      endpointsByDeployment[depName].push(ep);
    });

    // Build deployment nodes
    const deploymentNodes: HierarchyNode[] = deployments.map((dep) => {
      const depPolicies = policiesByScope.deployment.filter((p) =>
        p.scopeName === dep.name || p.scopeName === dep.id
      );

      const depEndpoints = endpointsByDeployment[dep.name] || [];

      // Build endpoint nodes
      const endpointNodes: HierarchyNode[] = depEndpoints.map((ep) => {
        const epPolicies = policiesByScope.endpoint.filter((p) =>
          p.scopeName === ep.name || p.scopeName === ep.id || p.scopeName === ep.agentId
        );

        return {
          id: ep.id,
          name: ep.name,
          level: 'endpoint' as HierarchyLevel,
          policies: epPolicies.map(policyToConfig),
          children: [],
        };
      });

      return {
        id: dep.id,
        name: dep.name,
        level: 'deployment' as HierarchyLevel,
        policies: depPolicies.map(policyToConfig),
        children: endpointNodes,
      };
    });

    // Build organization node
    return {
      id: org.id,
      name: org.name,
      level: 'organization' as HierarchyLevel,
      policies: policiesByScope.organization.map(policyToConfig),
      children: deploymentNodes,
    };
  }, [orgData, deploymentsData, endpointsData, policiesData]);

  const handleSelectNode = (node: HierarchyNode, policies: PolicyConfig[]) => {
    setSelectedNode(node);
    setEffectivePolicies(policies);
  };

  const handleRefresh = () => {
    refetchDeployments();
    refetchEndpoints();
    refetchPolicies();
  };

  const policyTypeColors: Record<string, string> = {
    rate_limit: 'blue',
    budget_limit: 'green',
    pii_filter: 'purple',
    model_restriction: 'orange',
    topic_filter: 'cyan',
    domain_filter: 'red',
    system_prompt: 'pink',
    content_filter: 'teal',
    tool_restriction: 'yellow',
  };

  const loading = orgLoading || deploymentsLoading || endpointsLoading || policiesLoading;

  return (
    <Box>
      {/* Legend */}
      <Card p="16px" bg={cardBg} mb="16px">
        <HStack spacing="24px" flexWrap="wrap">
          <Text fontSize="sm" fontWeight="600" color={textColor}>Hierarchy Levels:</Text>
          {Object.entries(levelLabels).map(([level, label]) => (
            <HStack key={level} spacing="6px">
              <Flex
                w="20px"
                h="20px"
                bg={`${levelColors[level as HierarchyLevel]}.500`}
                borderRadius="4px"
                align="center"
                justify="center"
              >
                <Icon as={levelIcons[level as HierarchyLevel]} color="white" boxSize="12px" />
              </Flex>
              <Text fontSize="xs" color={subtleText}>{label}</Text>
            </HStack>
          ))}
        </HStack>
      </Card>

      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing="20px">
        {/* Tree View */}
        <Card p="20px" bg={cardBg}>
          <HStack mb="16px" justify="space-between">
            <HStack spacing="8px">
              <Icon as={MdLayers} color="brand.500" />
              <Text fontSize="md" fontWeight="600" color={textColor}>
                Policy Hierarchy
              </Text>
            </HStack>
            <HStack>
              <Button
                size="sm"
                variant="ghost"
                leftIcon={<MdRefresh />}
                onClick={handleRefresh}
                isLoading={loading}
              >
                Refresh
              </Button>
              <Button size="sm" variant="outline" leftIcon={<MdCompareArrows />} onClick={onOpen}>
                Compare
              </Button>
            </HStack>
          </HStack>

          {loading && (
            <Flex justify="center" py="40px">
              <Spinner size="lg" color="brand.500" />
            </Flex>
          )}

          {!loading && !hierarchy && (
            <Alert status="warning" borderRadius="md">
              <AlertIcon />
              No organization data available
            </Alert>
          )}

          {!loading && hierarchy && (
            <Box maxH="600px" overflowY="auto">
              <TreeNode
                node={hierarchy}
                depth={0}
                parentPolicies={[]}
                onSelectNode={handleSelectNode}
                selectedNodeId={selectedNode?.id || null}
              />
            </Box>
          )}
        </Card>

        {/* Effective Policies Panel */}
        <Card p="20px" bg={cardBg}>
          <HStack mb="16px" spacing="8px">
            <Icon as={MdPolicy} color="brand.500" />
            <Text fontSize="md" fontWeight="600" color={textColor}>
              {selectedNode ? `Effective Policies at ${selectedNode.name}` : 'Select a node'}
            </Text>
          </HStack>

          {selectedNode ? (
            <VStack align="stretch" spacing="12px">
              {/* Path Display */}
              <Box p="12px" bg={codeBg} borderRadius="md">
                <Text fontSize="xs" color={subtleText} mb="4px">Inheritance Path</Text>
                <HStack spacing="4px" flexWrap="wrap">
                  <Badge colorScheme="purple">Organization</Badge>
                  <Icon as={MdArrowForward} color="gray.400" />
                  {selectedNode.level !== 'organization' && (
                    <>
                      {selectedNode.level === 'sub_organization' || selectedNode.level === 'deployment' || selectedNode.level === 'endpoint' || selectedNode.level === 'user' ? (
                        <>
                          <Badge colorScheme="blue">Team</Badge>
                          <Icon as={MdArrowForward} color="gray.400" />
                        </>
                      ) : null}
                      {selectedNode.level === 'deployment' || selectedNode.level === 'endpoint' || selectedNode.level === 'user' ? (
                        <>
                          <Badge colorScheme="green">Deployment</Badge>
                          <Icon as={MdArrowForward} color="gray.400" />
                        </>
                      ) : null}
                      {selectedNode.level === 'endpoint' || selectedNode.level === 'user' ? (
                        <>
                          <Badge colorScheme="orange">Endpoint</Badge>
                          <Icon as={MdArrowForward} color="gray.400" />
                        </>
                      ) : null}
                      {selectedNode.level === 'user' ? (
                        <Badge colorScheme="pink">User</Badge>
                      ) : null}
                    </>
                  )}
                </HStack>
              </Box>

              <Divider />

              {/* Policy List */}
              {effectivePolicies.length > 0 ? (
                effectivePolicies.map((policy) => (
                  <Box
                    key={policy.id}
                    p="12px"
                    border="1px solid"
                    borderColor={borderColor}
                    borderRadius="md"
                    borderLeft="4px solid"
                    borderLeftColor={`${policyTypeColors[policy.type] || 'gray'}.500`}
                  >
                    <HStack justify="space-between" mb="8px">
                      <HStack spacing="8px">
                        <Text fontSize="sm" fontWeight="500">{policy.name}</Text>
                        <Badge colorScheme={policyTypeColors[policy.type] || 'gray'} fontSize="10px">
                          {policy.type}
                        </Badge>
                      </HStack>
                      <HStack spacing="4px">
                        {policy.inherited && (
                          <Tooltip label={`Inherited from ${policy.inheritedFrom}`}>
                            <Badge colorScheme="blue" fontSize="9px">inherited</Badge>
                          </Tooltip>
                        )}
                        {policy.overridden && (
                          <Tooltip label={`Overrides policy from ${policy.overriddenAt}`}>
                            <Badge colorScheme="yellow" fontSize="9px">override</Badge>
                          </Tooltip>
                        )}
                        {!policy.inherited && !policy.overridden && (
                          <Badge colorScheme="green" fontSize="9px">direct</Badge>
                        )}
                      </HStack>
                    </HStack>
                    <Code fontSize="xs" p="8px" display="block" borderRadius="md" bg={codeBg}>
                      {JSON.stringify(policy.value, null, 2)}
                    </Code>
                  </Box>
                ))
              ) : (
                <Box textAlign="center" py="40px">
                  <Text color={subtleText}>No policies at this level</Text>
                </Box>
              )}
            </VStack>
          ) : (
            <Box textAlign="center" py="60px">
              <Icon as={MdPolicy} boxSize="48px" color="gray.300" mb="12px" />
              <Text color={subtleText}>Click on a node to see effective policies</Text>
            </Box>
          )}
        </Card>
      </SimpleGrid>

      {/* Compare Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Compare Policy Inheritance</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text color={subtleText} mb="16px">
              Select two nodes in the hierarchy to compare their effective policies side by side.
            </Text>
            <SimpleGrid columns={2} spacing="16px">
              <Box p="16px" border="1px dashed" borderColor={borderColor} borderRadius="md" textAlign="center">
                <Text color={subtleText}>Node A</Text>
                <Text fontSize="sm">Click a node to select</Text>
              </Box>
              <Box p="16px" border="1px dashed" borderColor={borderColor} borderRadius="md" textAlign="center">
                <Text color={subtleText}>Node B</Text>
                <Text fontSize="sm">Click a node to select</Text>
              </Box>
            </SimpleGrid>
          </ModalBody>
          <ModalFooter>
            <Button onClick={onClose}>Close</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
