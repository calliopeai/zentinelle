'use client';

import {
  Box,
  Button,
  Flex,
  Heading,
  Icon,
  Text,
  useColorModeValue,
  Badge,
  Spinner,
  VStack,
  HStack,
  Input,
  InputGroup,
  InputLeftElement,
  Select,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Tooltip,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Tag,
  TagLabel,
} from '@chakra-ui/react';
import { useQuery } from '@apollo/client';
import { useState } from 'react';
import {
  MdSearch,
  MdRefresh,
  MdCheckCircle,
  MdCancel,
  MdWarning,
  MdInfo,
  MdOpenInNew,
  MdCompareArrows,
} from 'react-icons/md';
import Card from 'components/card/Card';
import ModelComparison from 'components/zentinelle/ModelComparison';
import {
  GET_AI_MODELS,
  GET_MODEL_APPROVALS,
  MODEL_TYPE_OPTIONS,
  RISK_LEVEL_OPTIONS,
  PROVIDER_OPTIONS,
  APPROVAL_STATUS_OPTIONS,
} from 'graphql/models';

interface AIModel {
  id: string;
  modelId: string;
  name: string;
  description: string;
  modelType: string;
  modelTypeDisplay: string;
  riskLevel: string;
  riskLevelDisplay: string;
  capabilities: string[];
  contextWindow: number | null;
  maxOutputTokens: number | null;
  inputPricePerMillion: number | null;
  outputPricePerMillion: number | null;
  isAvailable: boolean;
  deprecated: boolean;
  providerSlug: string;
  providerName: string;
  fullModelId: string;
  replacementModelName: string | null;
  documentationUrl: string;
}

interface ModelApproval {
  id: string;
  modelId: string;
  modelName: string;
  modelProvider: string;
  modelRiskLevel: string;
  status: string;
  statusDisplay: string;
  isUsable: boolean;
  maxDailyRequests: number | null;
  maxMonthlyCost: number | null;
  requiresJustification: boolean;
  requiresApproval: boolean;
  reviewNotes: string;
  reviewedAt: string | null;
  reviewedByUsername: string | null;
}

function getRiskColor(riskLevel: string): string {
  const option = RISK_LEVEL_OPTIONS.find((o) => o.value === riskLevel);
  return option?.color || 'gray';
}

function getApprovalColor(status: string): string {
  const option = APPROVAL_STATUS_OPTIONS.find((o) => o.value === status);
  return option?.color || 'gray';
}

function formatNumber(num: number | null): string {
  if (num === null) return '-';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
  return num.toString();
}

function formatPrice(price: number | string | null | undefined): string {
  if (price === null || price === undefined) return '-';
  const p = Number(price);
  if (isNaN(p)) return '-';
  if (p < 1) return `$${p.toFixed(3)}`;
  return `$${p.toFixed(2)}`;
}

function ModelRegistryTab({
  textColor,
  cardBg,
  borderColor,
}: {
  textColor: string;
  cardBg: string;
  borderColor: string;
}) {
  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [riskFilter, setRiskFilter] = useState('');

  const { data, loading, error, refetch } = useQuery(GET_AI_MODELS, {
    variables: {
      first: 100,
      search: search || undefined,
      providerSlug: providerFilter || undefined,
      modelType: typeFilter || undefined,
      riskLevel: riskFilter || undefined,
      availableOnly: true,
    },
    fetchPolicy: 'cache-and-network',
  });

  const models: AIModel[] =
    data?.aiModels?.edges?.map((e: { node: AIModel }) => e.node) || [];

  if (loading && !data) {
    return (
      <Flex justify="center" py="40px">
        <Spinner size="xl" color="brand.500" />
      </Flex>
    );
  }

  if (error) {
    return (
      <Card p="20px" bg={cardBg}>
        <Text color="red.500">Error loading models: {error.message}</Text>
      </Card>
    );
  }

  return (
    <Box>
      {/* Filters */}
      <Card p="16px" bg={cardBg} mb="20px">
        <Flex gap="16px" flexWrap="wrap" align="center">
          <InputGroup maxW="300px">
            <InputLeftElement pointerEvents="none">
              <Icon as={MdSearch} color="gray.400" />
            </InputLeftElement>
            <Input
              placeholder="Search models..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </InputGroup>
          <Select
            placeholder="All Providers"
            maxW="180px"
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
          >
            {PROVIDER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
          <Select
            placeholder="All Types"
            maxW="180px"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            {MODEL_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
          <Select
            placeholder="All Risk Levels"
            maxW="180px"
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
          >
            {RISK_LEVEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
          <Button
            variant="ghost"
            leftIcon={<Icon as={MdRefresh} />}
            onClick={() => refetch()}
            isLoading={loading}
            size="sm"
          >
            Refresh
          </Button>
        </Flex>
      </Card>

      {/* Models Table */}
      <Card p="0" bg={cardBg} overflow="hidden">
        <TableContainer>
          <Table variant="simple" size="sm">
            <Thead>
              <Tr>
                <Th borderColor={borderColor}>Model</Th>
                <Th borderColor={borderColor}>Provider</Th>
                <Th borderColor={borderColor}>Type</Th>
                <Th borderColor={borderColor}>Risk</Th>
                <Th borderColor={borderColor} isNumeric>Context</Th>
                <Th borderColor={borderColor} isNumeric>Input $/M</Th>
                <Th borderColor={borderColor} isNumeric>Output $/M</Th>
                <Th borderColor={borderColor}>Capabilities</Th>
              </Tr>
            </Thead>
            <Tbody>
              {models.map((model) => (
                <Tr key={model.id}>
                  <Td borderColor={borderColor}>
                    <VStack align="start" spacing="2px">
                      <HStack spacing="8px">
                        <Text fontWeight="600" color={textColor}>
                          {model.name}
                        </Text>
                        {model.deprecated && (
                          <Badge colorScheme="red" fontSize="9px">
                            Deprecated
                          </Badge>
                        )}
                        {model.documentationUrl && (
                          <Tooltip label="View documentation">
                            <Box
                              as="a"
                              href={model.documentationUrl}
                              target="_blank"
                              color="gray.400"
                              _hover={{ color: 'brand.500' }}
                            >
                              <Icon as={MdOpenInNew} boxSize="14px" />
                            </Box>
                          </Tooltip>
                        )}
                      </HStack>
                      <Text fontSize="xs" color="gray.500">
                        {model.modelId}
                      </Text>
                    </VStack>
                  </Td>
                  <Td borderColor={borderColor}>
                    <Text fontSize="sm">{model.providerName}</Text>
                  </Td>
                  <Td borderColor={borderColor}>
                    <Badge colorScheme="blue" fontSize="10px">
                      {model.modelTypeDisplay}
                    </Badge>
                  </Td>
                  <Td borderColor={borderColor}>
                    <Badge colorScheme={getRiskColor(model.riskLevel)} fontSize="10px">
                      {model.riskLevelDisplay}
                    </Badge>
                  </Td>
                  <Td borderColor={borderColor} isNumeric>
                    <Text fontSize="sm">{formatNumber(model.contextWindow)}</Text>
                  </Td>
                  <Td borderColor={borderColor} isNumeric>
                    <Text fontSize="sm">{formatPrice(model.inputPricePerMillion)}</Text>
                  </Td>
                  <Td borderColor={borderColor} isNumeric>
                    <Text fontSize="sm">{formatPrice(model.outputPricePerMillion)}</Text>
                  </Td>
                  <Td borderColor={borderColor}>
                    <HStack spacing="4px" flexWrap="wrap">
                      {model.capabilities.slice(0, 3).map((cap) => (
                        <Tag key={cap} size="sm" colorScheme="gray" fontSize="9px">
                          <TagLabel>{cap.replace(/_/g, ' ')}</TagLabel>
                        </Tag>
                      ))}
                      {model.capabilities.length > 3 && (
                        <Tag size="sm" colorScheme="gray" fontSize="9px">
                          <TagLabel>+{model.capabilities.length - 3}</TagLabel>
                        </Tag>
                      )}
                    </HStack>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableContainer>
        {models.length === 0 && (
          <Box p="40px" textAlign="center">
            <Text color="gray.500">No models found matching your filters</Text>
          </Box>
        )}
      </Card>
    </Box>
  );
}

function ApprovalsTab({
  textColor,
  cardBg,
  borderColor,
}: {
  textColor: string;
  cardBg: string;
  borderColor: string;
}) {
  const [statusFilter, setStatusFilter] = useState('');
  const [providerFilter, setProviderFilter] = useState('');

  const { data, loading, error, refetch } = useQuery(GET_MODEL_APPROVALS, {
    variables: {
      status: statusFilter || undefined,
      providerSlug: providerFilter || undefined,
    },
    fetchPolicy: 'cache-and-network',
  });

  const approvals: ModelApproval[] =
    data?.modelApprovals?.edges?.map((e: { node: ModelApproval }) => e.node) || [];

  if (loading && !data) {
    return (
      <Flex justify="center" py="40px">
        <Spinner size="xl" color="brand.500" />
      </Flex>
    );
  }

  if (error) {
    return (
      <Card p="20px" bg={cardBg}>
        <Text color="red.500">Error loading approvals: {error.message}</Text>
      </Card>
    );
  }

  return (
    <Box>
      {/* Filters */}
      <Card p="16px" bg={cardBg} mb="20px">
        <Flex gap="16px" flexWrap="wrap" align="center">
          <Select
            placeholder="All Statuses"
            maxW="200px"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {APPROVAL_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
          <Select
            placeholder="All Providers"
            maxW="180px"
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
          >
            {PROVIDER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
          <Button
            variant="ghost"
            leftIcon={<Icon as={MdRefresh} />}
            onClick={() => refetch()}
            isLoading={loading}
            size="sm"
          >
            Refresh
          </Button>
        </Flex>
      </Card>

      {approvals.length === 0 ? (
        <Card p="40px" bg={cardBg} textAlign="center">
          <VStack spacing="16px">
            <Icon as={MdInfo} boxSize="48px" color="gray.400" />
            <Text color="gray.500">No model approvals configured yet</Text>
            <Text fontSize="sm" color="gray.400">
              Request approval for models from the Model Registry tab
            </Text>
          </VStack>
        </Card>
      ) : (
        <Card p="0" bg={cardBg} overflow="hidden">
          <TableContainer>
            <Table variant="simple" size="sm">
              <Thead>
                <Tr>
                  <Th borderColor={borderColor}>Model</Th>
                  <Th borderColor={borderColor}>Provider</Th>
                  <Th borderColor={borderColor}>Risk Level</Th>
                  <Th borderColor={borderColor}>Status</Th>
                  <Th borderColor={borderColor}>Restrictions</Th>
                  <Th borderColor={borderColor}>Reviewed By</Th>
                </Tr>
              </Thead>
              <Tbody>
                {approvals.map((approval) => (
                  <Tr key={approval.id}>
                    <Td borderColor={borderColor}>
                      <Text fontWeight="600" color={textColor}>
                        {approval.modelName}
                      </Text>
                    </Td>
                    <Td borderColor={borderColor}>
                      <Text fontSize="sm">{approval.modelProvider}</Text>
                    </Td>
                    <Td borderColor={borderColor}>
                      <Text fontSize="sm">{approval.modelRiskLevel}</Text>
                    </Td>
                    <Td borderColor={borderColor}>
                      <HStack spacing="8px">
                        <Icon
                          as={
                            approval.isUsable
                              ? MdCheckCircle
                              : approval.status === 'pending'
                              ? MdWarning
                              : MdCancel
                          }
                          color={`${getApprovalColor(approval.status)}.500`}
                        />
                        <Badge colorScheme={getApprovalColor(approval.status)}>
                          {approval.statusDisplay}
                        </Badge>
                      </HStack>
                    </Td>
                    <Td borderColor={borderColor}>
                      <VStack align="start" spacing="2px">
                        {approval.maxDailyRequests && (
                          <Text fontSize="xs" color="gray.500">
                            {approval.maxDailyRequests.toLocaleString()} req/day
                          </Text>
                        )}
                        {approval.maxMonthlyCost && (
                          <Text fontSize="xs" color="gray.500">
                            ${approval.maxMonthlyCost}/mo max
                          </Text>
                        )}
                        {approval.requiresApproval && (
                          <Badge colorScheme="purple" fontSize="9px">
                            Requires Approval
                          </Badge>
                        )}
                        {!approval.maxDailyRequests &&
                          !approval.maxMonthlyCost &&
                          !approval.requiresApproval && (
                            <Text fontSize="xs" color="gray.400">
                              No restrictions
                            </Text>
                          )}
                      </VStack>
                    </Td>
                    <Td borderColor={borderColor}>
                      <Text fontSize="sm" color="gray.500">
                        {approval.reviewedByUsername || '-'}
                      </Text>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
        </Card>
      )}
    </Box>
  );
}

export default function ModelRegistryPage() {
  const cardBg = useColorModeValue('white', 'navy.800');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.100');

  return (
    <Box pt={{ base: '130px', md: '80px', xl: '80px' }}>
      {/* Header */}
      <Flex justify="space-between" align="center" mb="20px">
        <Box>
          <Heading size="lg" color={textColor}>
            Model Registry
          </Heading>
          <Text fontSize="sm" color="secondaryGray.600">
            Available AI models and organization approvals
          </Text>
        </Box>
      </Flex>

      {/* Tabs */}
      <Tabs variant="enclosed" colorScheme="brand">
        <TabList mb="16px">
          <Tab>Available Models</Tab>
          <Tab>
            <Icon as={MdCompareArrows} mr={2} />
            Compare Models
          </Tab>
          <Tab>Organization Approvals</Tab>
        </TabList>

        <TabPanels>
          <TabPanel p="0">
            <ModelRegistryTab
              textColor={textColor}
              cardBg={cardBg}
              borderColor={borderColor}
            />
          </TabPanel>
          <TabPanel p="0">
            <ModelComparison />
          </TabPanel>
          <TabPanel p="0">
            <ApprovalsTab
              textColor={textColor}
              cardBg={cardBg}
              borderColor={borderColor}
            />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Box>
  );
}
