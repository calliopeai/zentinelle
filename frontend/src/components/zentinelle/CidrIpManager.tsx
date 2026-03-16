'use client';

import {
  Box,
  VStack,
  HStack,
  Text,
  Icon,
  Button,
  IconButton,
  Input,
  Select,
  Switch,
  Spinner,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Badge,
  Flex,
  useColorModeValue,
  useToast,
} from '@chakra-ui/react';
import { MdSecurity, MdAdd, MdDelete } from 'react-icons/md';
import { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import Card from 'components/card/Card';
import { GET_POLICIES, CREATE_POLICY, UPDATE_POLICY } from 'graphql/policies';

interface NetworkPolicyConfig {
  allowed_ips: string[];
  blocked_ips: string[];
  allowed_domains: string[];
  blocked_domains: string[];
  allow_outbound: boolean;
}

interface Policy {
  id: string;
  name: string;
  policyType: string;
  config: string;
  enabled: boolean;
}

type RuleType = 'allow_ip' | 'block_ip' | 'allow_domain' | 'block_domain';

interface FlatRule {
  value: string;
  type: RuleType;
  policyId: string;
  policyName: string;
}

const RULE_TYPE_LABELS: Record<RuleType, string> = {
  allow_ip: 'Allow IP',
  block_ip: 'Block IP',
  allow_domain: 'Allow Domain',
  block_domain: 'Block Domain',
};

const RULE_TYPE_COLORS: Record<RuleType, string> = {
  allow_ip: 'green',
  block_ip: 'red',
  allow_domain: 'blue',
  block_domain: 'orange',
};

function parseConfig(configStr: string): NetworkPolicyConfig {
  try {
    const parsed = JSON.parse(configStr);
    return {
      allowed_ips: parsed.allowed_ips || [],
      blocked_ips: parsed.blocked_ips || [],
      allowed_domains: parsed.allowed_domains || [],
      blocked_domains: parsed.blocked_domains || [],
      allow_outbound: parsed.allow_outbound ?? true,
    };
  } catch {
    return {
      allowed_ips: [],
      blocked_ips: [],
      allowed_domains: [],
      blocked_domains: [],
      allow_outbound: true,
    };
  }
}

function flattenRules(policies: Policy[]): FlatRule[] {
  const rules: FlatRule[] = [];
  for (const policy of policies) {
    const cfg = parseConfig(policy.config);
    for (const v of cfg.allowed_ips) rules.push({ value: v, type: 'allow_ip', policyId: policy.id, policyName: policy.name });
    for (const v of cfg.blocked_ips) rules.push({ value: v, type: 'block_ip', policyId: policy.id, policyName: policy.name });
    for (const v of cfg.allowed_domains) rules.push({ value: v, type: 'allow_domain', policyId: policy.id, policyName: policy.name });
    for (const v of cfg.blocked_domains) rules.push({ value: v, type: 'block_domain', policyId: policy.id, policyName: policy.name });
  }
  return rules;
}

function removeRuleFromConfig(cfg: NetworkPolicyConfig, value: string, type: RuleType): NetworkPolicyConfig {
  const updated = { ...cfg };
  switch (type) {
    case 'allow_ip': updated.allowed_ips = cfg.allowed_ips.filter((v) => v !== value); break;
    case 'block_ip': updated.blocked_ips = cfg.blocked_ips.filter((v) => v !== value); break;
    case 'allow_domain': updated.allowed_domains = cfg.allowed_domains.filter((v) => v !== value); break;
    case 'block_domain': updated.blocked_domains = cfg.blocked_domains.filter((v) => v !== value); break;
  }
  return updated;
}

function addRuleToConfig(cfg: NetworkPolicyConfig, value: string, type: RuleType): NetworkPolicyConfig {
  const updated = { ...cfg };
  switch (type) {
    case 'allow_ip': updated.allowed_ips = [...cfg.allowed_ips, value]; break;
    case 'block_ip': updated.blocked_ips = [...cfg.blocked_ips, value]; break;
    case 'allow_domain': updated.allowed_domains = [...cfg.allowed_domains, value]; break;
    case 'block_domain': updated.blocked_domains = [...cfg.blocked_domains, value]; break;
  }
  return updated;
}

const STANDALONE_ORG_ID = '00000000-0000-0000-0000-000000000001';

export default function CidrIpManager() {
  const cardBg = useColorModeValue('white', 'navy.800');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const subtleText = useColorModeValue('gray.500', 'gray.400');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.100');
  const hoverBg = useColorModeValue('gray.50', 'whiteAlpha.50');

  const toast = useToast();

  const [newRuleValue, setNewRuleValue] = useState('');
  const [newRuleType, setNewRuleType] = useState<RuleType>('allow_ip');

  const { data, loading, error, refetch } = useQuery(GET_POLICIES, {
    variables: { policyType: 'network_policy', first: 50 },
    fetchPolicy: 'cache-and-network',
  });

  const [createPolicy, { loading: creating }] = useMutation(CREATE_POLICY, {
    onCompleted: (result) => {
      if (result.createPolicy.success) {
        toast({ title: 'Network policy created', status: 'success', duration: 2000 });
        refetch();
      } else {
        toast({ title: 'Failed to create policy', description: result.createPolicy.error, status: 'error' });
      }
    },
  });

  const [updatePolicy, { loading: updating }] = useMutation(UPDATE_POLICY, {
    onCompleted: (result) => {
      if (result.updatePolicy.success) {
        toast({ title: 'Policy updated', status: 'success', duration: 2000 });
        refetch();
      } else {
        toast({ title: 'Failed to update policy', description: result.updatePolicy.error, status: 'error' });
      }
    },
  });

  const policies: Policy[] = data?.policies?.edges?.map((e: { node: Policy }) => e.node) || [];

  const rules = flattenRules(policies);

  // Use the first policy as the target for new rules when multiple exist
  const targetPolicy = policies[0] ?? null;

  const handleCreatePolicy = () => {
    createPolicy({
      variables: {
        organizationId: STANDALONE_ORG_ID,
        input: {
          name: 'Network Policy',
          description: 'IP and domain access control',
          policyType: 'network_policy',
          scopeType: 'organization',
          enforcement: 'enforce',
          config: JSON.stringify({
            allowed_ips: [],
            blocked_ips: [],
            allowed_domains: [],
            blocked_domains: [],
            allow_outbound: true,
          }),
        },
      },
    });
  };

  const handleAddRule = () => {
    const value = newRuleValue.trim();
    if (!value || !targetPolicy) return;

    const cfg = parseConfig(targetPolicy.config);
    const newCfg = addRuleToConfig(cfg, value, newRuleType);

    updatePolicy({
      variables: {
        input: {
          id: targetPolicy.id,
          config: JSON.stringify(newCfg),
        },
      },
    });
    setNewRuleValue('');
  };

  const handleRemoveRule = (rule: FlatRule) => {
    const policy = policies.find((p) => p.id === rule.policyId);
    if (!policy) return;

    const cfg = parseConfig(policy.config);
    const newCfg = removeRuleFromConfig(cfg, rule.value, rule.type);

    updatePolicy({
      variables: {
        input: {
          id: policy.id,
          config: JSON.stringify(newCfg),
        },
      },
    });
  };

  const handleToggleOutbound = (policy: Policy) => {
    const cfg = parseConfig(policy.config);
    const newCfg = { ...cfg, allow_outbound: !cfg.allow_outbound };

    updatePolicy({
      variables: {
        input: {
          id: policy.id,
          config: JSON.stringify(newCfg),
        },
      },
    });
  };

  return (
    <Card p="20px" bg={cardBg}>
      <VStack spacing="24px" align="stretch">

        {/* Header */}
        <HStack justify="space-between">
          <VStack align="start" spacing="4px">
            <HStack>
              <Icon as={MdSecurity} color="brand.500" boxSize="20px" />
              <Text fontWeight="600" color={textColor}>IP Access Control</Text>
            </HStack>
            <Text fontSize="sm" color={subtleText}>
              Restrict agent network access by IP address, CIDR range, or domain
            </Text>
          </VStack>
          {targetPolicy && (
            <Button
              size="sm"
              variant="brand"
              leftIcon={<Icon as={MdAdd} />}
              isDisabled={!newRuleValue.trim() || updating}
              onClick={handleAddRule}
            >
              Add Rule
            </Button>
          )}
        </HStack>

        {/* Loading */}
        {loading && policies.length === 0 && (
          <Flex justify="center" py="32px">
            <Spinner size="lg" color="brand.500" />
          </Flex>
        )}

        {/* Error */}
        {error && (
          <Text color="red.500" fontSize="sm">Error loading policies: {error.message}</Text>
        )}

        {/* Empty state — no policies */}
        {!loading && !error && policies.length === 0 && (
          <Flex direction="column" align="center" py="40px" gap="12px">
            <Icon as={MdSecurity} boxSize="40px" color="gray.300" />
            <Text fontWeight="500" color={textColor}>No network policy configured</Text>
            <Text fontSize="sm" color={subtleText}>Create a network policy to manage IP and domain access rules.</Text>
            <Button
              variant="brand"
              leftIcon={<Icon as={MdAdd} />}
              isLoading={creating}
              onClick={handleCreatePolicy}
            >
              Create Network Policy
            </Button>
          </Flex>
        )}

        {/* Policy list with outbound toggle */}
        {policies.length > 0 && (
          <VStack align="stretch" spacing="12px">
            {policies.map((policy) => {
              const cfg = parseConfig(policy.config);
              return (
                <HStack
                  key={policy.id}
                  justify="space-between"
                  p="12px"
                  borderRadius="md"
                  border="1px solid"
                  borderColor={borderColor}
                >
                  <VStack align="start" spacing="2px">
                    <Text fontWeight="600" fontSize="sm" color={textColor}>{policy.name}</Text>
                    <Text fontSize="xs" color={subtleText}>
                      {rules.filter((r) => r.policyId === policy.id).length} rule(s)
                    </Text>
                  </VStack>
                  <HStack spacing="8px">
                    <Text fontSize="xs" color={subtleText}>Allow outbound</Text>
                    <Switch
                      isChecked={cfg.allow_outbound}
                      onChange={() => handleToggleOutbound(policy)}
                      colorScheme="brand"
                      size="sm"
                      isDisabled={updating}
                    />
                  </HStack>
                </HStack>
              );
            })}
          </VStack>
        )}

        {/* Add Rule form */}
        {policies.length > 0 && (
          <HStack spacing="8px" flexWrap="wrap">
            <Input
              placeholder="e.g. 10.0.0.0/8 or *.example.com"
              value={newRuleValue}
              onChange={(e) => setNewRuleValue(e.target.value)}
              size="sm"
              maxW="280px"
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddRule(); }}
            />
            <Select
              value={newRuleType}
              onChange={(e) => setNewRuleType(e.target.value as RuleType)}
              size="sm"
              maxW="160px"
            >
              <option value="allow_ip">Allow IP</option>
              <option value="block_ip">Block IP</option>
              <option value="allow_domain">Allow Domain</option>
              <option value="block_domain">Block Domain</option>
            </Select>
            <Button
              size="sm"
              variant="brand"
              leftIcon={<Icon as={MdAdd} />}
              isDisabled={!newRuleValue.trim() || updating}
              isLoading={updating}
              onClick={handleAddRule}
            >
              Add
            </Button>
          </HStack>
        )}

        {/* Rules table */}
        {rules.length > 0 && (
          <Box>
            <TableContainer>
              <Table size="sm" variant="simple">
                <Thead>
                  <Tr>
                    <Th borderColor={borderColor} color="secondaryGray.600">Rule</Th>
                    <Th borderColor={borderColor} color="secondaryGray.600">Type</Th>
                    <Th borderColor={borderColor} color="secondaryGray.600">Policy</Th>
                    <Th borderColor={borderColor} color="secondaryGray.600" w="60px">Remove</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {rules.map((rule, idx) => (
                    <Tr key={`${rule.policyId}-${rule.type}-${rule.value}-${idx}`} _hover={{ bg: hoverBg }}>
                      <Td borderColor={borderColor}>
                        <Text fontSize="sm" fontFamily="mono" color={textColor}>{rule.value}</Text>
                      </Td>
                      <Td borderColor={borderColor}>
                        <Badge colorScheme={RULE_TYPE_COLORS[rule.type]} fontSize="10px">
                          {RULE_TYPE_LABELS[rule.type]}
                        </Badge>
                      </Td>
                      <Td borderColor={borderColor}>
                        <Text fontSize="xs" color={subtleText}>{rule.policyName}</Text>
                      </Td>
                      <Td borderColor={borderColor}>
                        <IconButton
                          aria-label="Remove rule"
                          icon={<MdDelete />}
                          size="sm"
                          variant="ghost"
                          colorScheme="red"
                          isDisabled={updating}
                          onClick={() => handleRemoveRule(rule)}
                        />
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* Empty rules state when policy exists but no rules */}
        {!loading && policies.length > 0 && rules.length === 0 && (
          <Flex justify="center" py="24px">
            <Text fontSize="sm" color={subtleText}>No rules yet. Add an IP, CIDR range, or domain above.</Text>
          </Flex>
        )}

      </VStack>
    </Card>
  );
}
