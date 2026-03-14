'use client';

import React, { useState, useMemo } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Select,
  useColorModeValue,
  Card,
  CardBody,
  CardHeader,
  Heading,
  Badge,
  Icon,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Flex,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  Checkbox,
  Progress,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  SimpleGrid,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Tooltip,
  Alert,
  AlertIcon,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  Divider,
  Tag,
  TagLabel,
  TagCloseButton,
  Wrap,
  WrapItem,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
} from '@chakra-ui/react';
import {
  MdCompareArrows,
  MdSearch,
  MdClose,
  MdAdd,
  MdCheckCircle,
  MdCancel,
  MdStar,
  MdTrendingUp,
  MdAttachMoney,
  MdSpeed,
  MdSecurity,
  MdInfo,
} from 'react-icons/md';
import { useQuery } from '@apollo/client';
import { GET_AI_MODELS, PROVIDER_OPTIONS, RISK_LEVEL_OPTIONS } from 'graphql/models';

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
  documentationUrl: string;
}

interface UsageEstimate {
  dailyRequests: number;
  avgInputTokens: number;
  avgOutputTokens: number;
}

const DEFAULT_USAGE: UsageEstimate = {
  dailyRequests: 1000,
  avgInputTokens: 500,
  avgOutputTokens: 200,
};

const CAPABILITY_LABELS: Record<string, string> = {
  chat: 'Chat/Conversation',
  completion: 'Text Completion',
  function_calling: 'Function Calling',
  vision: 'Vision/Image',
  code_interpreter: 'Code Interpreter',
  web_search: 'Web Search',
  file_upload: 'File Upload',
  long_context: 'Long Context (100K+)',
};

const USE_CASES = [
  { id: 'chat', name: 'Customer Support Chat', requirements: ['chat', 'function_calling'], contextNeed: 'low', outputNeed: 'medium' },
  { id: 'analysis', name: 'Document Analysis', requirements: ['long_context', 'chat'], contextNeed: 'high', outputNeed: 'high' },
  { id: 'code', name: 'Code Generation', requirements: ['function_calling'], contextNeed: 'medium', outputNeed: 'high' },
  { id: 'vision', name: 'Image Analysis', requirements: ['vision'], contextNeed: 'low', outputNeed: 'medium' },
  { id: 'reasoning', name: 'Complex Reasoning', requirements: ['chat'], contextNeed: 'high', outputNeed: 'high' },
];

function formatPrice(price: number | null): string {
  if (price === null || price === undefined) return '-';
  if (price < 0.01) return `$${price.toFixed(4)}`;
  if (price < 1) return `$${price.toFixed(3)}`;
  return `$${price.toFixed(2)}`;
}

function formatTokenCount(count: number | null): string {
  if (count === null || count === undefined) return '-';
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
  return count.toString();
}

function getRiskColor(riskLevel: string): string {
  const option = RISK_LEVEL_OPTIONS.find((o) => o.value === riskLevel);
  return option?.color || 'gray';
}

function calculateMonthlyCost(model: AIModel, usage: UsageEstimate): number {
  const inputPrice = model.inputPricePerMillion || 0;
  const outputPrice = model.outputPricePerMillion || 0;

  const monthlyRequests = usage.dailyRequests * 30;
  const totalInputTokens = monthlyRequests * usage.avgInputTokens;
  const totalOutputTokens = monthlyRequests * usage.avgOutputTokens;

  const inputCost = (totalInputTokens / 1000000) * inputPrice;
  const outputCost = (totalOutputTokens / 1000000) * outputPrice;

  return inputCost + outputCost;
}

function getModelScore(model: AIModel, useCase: string): { score: number; reasons: string[] } {
  const useCaseConfig = USE_CASES.find((uc) => uc.id === useCase);
  if (!useCaseConfig) return { score: 50, reasons: [] };

  let score = 50;
  const reasons: string[] = [];

  // Check required capabilities
  const hasAllRequired = useCaseConfig.requirements.every((cap) =>
    model.capabilities.includes(cap)
  );
  if (hasAllRequired) {
    score += 30;
    reasons.push('Has all required capabilities');
  } else {
    const missing = useCaseConfig.requirements.filter((cap) =>
      !model.capabilities.includes(cap)
    );
    score -= missing.length * 10;
    reasons.push(`Missing: ${missing.join(', ')}`);
  }

  // Context window scoring
  if (useCaseConfig.contextNeed === 'high' && model.contextWindow) {
    if (model.contextWindow >= 100000) {
      score += 15;
      reasons.push('Excellent context window');
    } else if (model.contextWindow >= 32000) {
      score += 5;
    }
  }

  // Risk level consideration
  if (model.riskLevel === 'minimal') {
    score += 5;
    reasons.push('Low compliance risk');
  } else if (model.riskLevel === 'high') {
    score -= 10;
    reasons.push('High compliance risk');
  }

  // Deprecation check
  if (model.deprecated) {
    score -= 20;
    reasons.push('Model is deprecated');
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

export default function ModelComparison() {
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [usage, setUsage] = useState<UsageEstimate>(DEFAULT_USAGE);
  const [selectedUseCase, setSelectedUseCase] = useState('chat');

  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const hoverBg = useColorModeValue('gray.50', 'whiteAlpha.100');
  const selectedBg = useColorModeValue('blue.50', 'blue.900');
  const headerBg = useColorModeValue('gray.50', 'whiteAlpha.50');
  const topRowBg = useColorModeValue('green.50', 'green.900');

  const { data, loading } = useQuery(GET_AI_MODELS, {
    variables: {
      first: 200,
      availableOnly: true,
      providerSlug: providerFilter || undefined,
    },
  });

  const allModels: AIModel[] = useMemo(() => {
    return data?.aiModels?.edges?.map((e: { node: AIModel }) => e.node) || [];
  }, [data]);

  const filteredModels = useMemo(() => {
    if (!search) return allModels;
    const searchLower = search.toLowerCase();
    return allModels.filter(
      (m) =>
        m.name.toLowerCase().includes(searchLower) ||
        m.modelId.toLowerCase().includes(searchLower) ||
        m.providerName.toLowerCase().includes(searchLower)
    );
  }, [allModels, search]);

  const comparisonModels = useMemo(() => {
    return selectedModels
      .map((id) => allModels.find((m) => m.modelId === id))
      .filter(Boolean) as AIModel[];
  }, [selectedModels, allModels]);

  // Calculate recommendations
  const recommendations = useMemo(() => {
    return allModels
      .map((model) => ({
        model,
        ...getModelScore(model, selectedUseCase),
        cost: calculateMonthlyCost(model, usage),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [allModels, selectedUseCase, usage]);

  // Find best value
  const bestValue = useMemo(() => {
    const eligibleModels = allModels.filter((m) => {
      const { score } = getModelScore(m, selectedUseCase);
      return score >= 70;
    });

    return eligibleModels.reduce((best, model) => {
      const cost = calculateMonthlyCost(model, usage);
      if (!best || cost < calculateMonthlyCost(best, usage)) {
        return model;
      }
      return best;
    }, null as AIModel | null);
  }, [allModels, selectedUseCase, usage]);

  const handleAddModel = (modelId: string) => {
    if (selectedModels.length >= 4) {
      return; // Max 4 for comparison
    }
    if (!selectedModels.includes(modelId)) {
      setSelectedModels([...selectedModels, modelId]);
    }
  };

  const handleRemoveModel = (modelId: string) => {
    setSelectedModels(selectedModels.filter((id) => id !== modelId));
  };

  // All unique capabilities across selected models
  const allCapabilities = useMemo(() => {
    const caps = new Set<string>();
    comparisonModels.forEach((m) => m.capabilities.forEach((c) => caps.add(c)));
    return Array.from(caps).sort();
  }, [comparisonModels]);

  return (
    <VStack spacing={6} align="stretch">
      <Tabs variant="enclosed">
        <TabList>
          <Tab><Icon as={MdCompareArrows} mr={2} />Side-by-Side</Tab>
          <Tab><Icon as={MdStar} mr={2} />Recommendations</Tab>
          <Tab><Icon as={MdAttachMoney} mr={2} />Cost Calculator</Tab>
        </TabList>

        <TabPanels>
          {/* Side-by-Side Comparison Tab */}
          <TabPanel p={0} pt={4}>
            <Card bg={bgColor}>
              <CardHeader>
                <HStack justify="space-between">
                  <Heading size="md">
                    <HStack>
                      <Icon as={MdCompareArrows} />
                      <Text>Model Comparison</Text>
                    </HStack>
                  </Heading>
                  <Badge colorScheme="blue">{selectedModels.length}/4 selected</Badge>
                </HStack>
              </CardHeader>
              <CardBody>
                {/* Model Selector */}
                <Box mb={4}>
                  <HStack mb={2}>
                    <InputGroup size="sm" maxW="300px">
                      <InputLeftElement>
                        <Icon as={MdSearch} color="gray.400" />
                      </InputLeftElement>
                      <Input
                        placeholder="Search models..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </InputGroup>
                    <Select
                      size="sm"
                      maxW="150px"
                      placeholder="All Providers"
                      value={providerFilter}
                      onChange={(e) => setProviderFilter(e.target.value)}
                    >
                      {PROVIDER_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </Select>
                  </HStack>

                  {/* Selected Models Tags */}
                  {selectedModels.length > 0 && (
                    <Wrap spacing={2} mb={3}>
                      {comparisonModels.map((model) => (
                        <WrapItem key={model.modelId}>
                          <Tag size="md" colorScheme="blue" borderRadius="full">
                            <TagLabel>{model.name}</TagLabel>
                            <TagCloseButton onClick={() => handleRemoveModel(model.modelId)} />
                          </Tag>
                        </WrapItem>
                      ))}
                    </Wrap>
                  )}

                  {/* Quick Add */}
                  <Box
                    maxH="200px"
                    overflowY="auto"
                    border="1px solid"
                    borderColor={borderColor}
                    borderRadius="md"
                  >
                    {filteredModels.slice(0, 20).map((model) => {
                      const isSelected = selectedModels.includes(model.modelId);
                      return (
                        <Flex
                          key={model.modelId}
                          px={3}
                          py={2}
                          align="center"
                          justify="space-between"
                          bg={isSelected ? selectedBg : 'transparent'}
                          _hover={{ bg: isSelected ? selectedBg : hoverBg }}
                          cursor="pointer"
                          onClick={() => isSelected ? handleRemoveModel(model.modelId) : handleAddModel(model.modelId)}
                          borderBottom="1px solid"
                          borderColor={borderColor}
                        >
                          <HStack>
                            <Checkbox isChecked={isSelected} readOnly size="sm" />
                            <VStack align="start" spacing={0}>
                              <Text fontSize="sm" fontWeight="500">{model.name}</Text>
                              <Text fontSize="xs" color="gray.500">{model.providerName}</Text>
                            </VStack>
                          </HStack>
                          <HStack>
                            <Badge colorScheme={getRiskColor(model.riskLevel)} fontSize="9px">
                              {model.riskLevelDisplay}
                            </Badge>
                            <Text fontSize="xs" color="gray.500">
                              {formatPrice(model.inputPricePerMillion)}/M
                            </Text>
                          </HStack>
                        </Flex>
                      );
                    })}
                  </Box>
                </Box>

                <Divider my={4} />

                {/* Comparison Table */}
                {comparisonModels.length > 0 ? (
                  <TableContainer>
                    <Table size="sm">
                      <Thead>
                        <Tr>
                          <Th>Attribute</Th>
                          {comparisonModels.map((model) => (
                            <Th key={model.modelId} textAlign="center">
                              <VStack spacing={1}>
                                <Text>{model.name}</Text>
                                <Badge colorScheme="gray" fontSize="9px">
                                  {model.providerName}
                                </Badge>
                              </VStack>
                            </Th>
                          ))}
                        </Tr>
                      </Thead>
                      <Tbody>
                        <Tr>
                          <Td fontWeight="500">Model Type</Td>
                          {comparisonModels.map((m) => (
                            <Td key={m.modelId} textAlign="center">
                              <Badge>{m.modelTypeDisplay}</Badge>
                            </Td>
                          ))}
                        </Tr>
                        <Tr>
                          <Td fontWeight="500">Risk Level</Td>
                          {comparisonModels.map((m) => (
                            <Td key={m.modelId} textAlign="center">
                              <Badge colorScheme={getRiskColor(m.riskLevel)}>
                                {m.riskLevelDisplay}
                              </Badge>
                            </Td>
                          ))}
                        </Tr>
                        <Tr>
                          <Td fontWeight="500">Context Window</Td>
                          {comparisonModels.map((m) => (
                            <Td key={m.modelId} textAlign="center">
                              {formatTokenCount(m.contextWindow)}
                            </Td>
                          ))}
                        </Tr>
                        <Tr>
                          <Td fontWeight="500">Max Output</Td>
                          {comparisonModels.map((m) => (
                            <Td key={m.modelId} textAlign="center">
                              {formatTokenCount(m.maxOutputTokens)}
                            </Td>
                          ))}
                        </Tr>
                        <Tr>
                          <Td fontWeight="500">Input Price (per 1M)</Td>
                          {comparisonModels.map((m) => (
                            <Td key={m.modelId} textAlign="center">
                              {formatPrice(m.inputPricePerMillion)}
                            </Td>
                          ))}
                        </Tr>
                        <Tr>
                          <Td fontWeight="500">Output Price (per 1M)</Td>
                          {comparisonModels.map((m) => (
                            <Td key={m.modelId} textAlign="center">
                              {formatPrice(m.outputPricePerMillion)}
                            </Td>
                          ))}
                        </Tr>
                        <Tr>
                          <Td fontWeight="500">Est. Monthly Cost</Td>
                          {comparisonModels.map((m) => {
                            const cost = calculateMonthlyCost(m, usage);
                            const minCost = Math.min(...comparisonModels.map((cm) => calculateMonthlyCost(cm, usage)));
                            const isLowest = cost === minCost;
                            return (
                              <Td key={m.modelId} textAlign="center">
                                <HStack justify="center">
                                  <Text fontWeight={isLowest ? 'bold' : 'normal'} color={isLowest ? 'green.500' : undefined}>
                                    ${cost.toFixed(2)}
                                  </Text>
                                  {isLowest && <Icon as={MdStar} color="green.500" />}
                                </HStack>
                              </Td>
                            );
                          })}
                        </Tr>

                        {/* Capabilities */}
                        <Tr bg={headerBg}>
                          <Td colSpan={comparisonModels.length + 1} fontWeight="bold">
                            Capabilities
                          </Td>
                        </Tr>
                        {allCapabilities.map((cap) => (
                          <Tr key={cap}>
                            <Td fontSize="sm">{CAPABILITY_LABELS[cap] || cap}</Td>
                            {comparisonModels.map((m) => (
                              <Td key={m.modelId} textAlign="center">
                                {m.capabilities.includes(cap) ? (
                                  <Icon as={MdCheckCircle} color="green.500" />
                                ) : (
                                  <Icon as={MdCancel} color="gray.300" />
                                )}
                              </Td>
                            ))}
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </TableContainer>
                ) : (
                  <Alert status="info">
                    <AlertIcon />
                    Select up to 4 models above to compare them side-by-side.
                  </Alert>
                )}
              </CardBody>
            </Card>
          </TabPanel>

          {/* Recommendations Tab */}
          <TabPanel p={0} pt={4}>
            <Card bg={bgColor}>
              <CardHeader>
                <VStack align="start" spacing={3}>
                  <Heading size="md">
                    <HStack>
                      <Icon as={MdStar} color="yellow.500" />
                      <Text>Smart Recommendations</Text>
                    </HStack>
                  </Heading>
                  <HStack>
                    <Text fontSize="sm" fontWeight="500">Use Case:</Text>
                    <Select
                      size="sm"
                      maxW="250px"
                      value={selectedUseCase}
                      onChange={(e) => setSelectedUseCase(e.target.value)}
                    >
                      {USE_CASES.map((uc) => (
                        <option key={uc.id} value={uc.id}>
                          {uc.name}
                        </option>
                      ))}
                    </Select>
                  </HStack>
                </VStack>
              </CardHeader>
              <CardBody>
                {/* Best Value Highlight */}
                {bestValue && (
                  <Alert status="success" mb={4} borderRadius="md">
                    <AlertIcon />
                    <Box>
                      <Text fontWeight="bold">Best Value: {bestValue.name}</Text>
                      <Text fontSize="sm">
                        Meets requirements at ${calculateMonthlyCost(bestValue, usage).toFixed(2)}/month
                      </Text>
                    </Box>
                  </Alert>
                )}

                {/* Recommendations List */}
                <VStack spacing={4} align="stretch">
                  {recommendations.map((rec, index) => (
                    <Box
                      key={rec.model.modelId}
                      p={4}
                      border="1px solid"
                      borderColor={index === 0 ? 'green.500' : borderColor}
                      borderRadius="md"
                      bg={index === 0 ? topRowBg : 'transparent'}
                    >
                      <HStack justify="space-between" mb={3}>
                        <HStack>
                          {index === 0 && <Icon as={MdStar} color="green.500" />}
                          <Text fontWeight="bold">{rec.model.name}</Text>
                          <Badge>{rec.model.providerName}</Badge>
                        </HStack>
                        <HStack>
                          <Badge colorScheme={rec.score >= 80 ? 'green' : rec.score >= 60 ? 'yellow' : 'red'}>
                            Score: {rec.score}
                          </Badge>
                          <Text fontWeight="500">${rec.cost.toFixed(2)}/mo</Text>
                        </HStack>
                      </HStack>

                      <Progress
                        value={rec.score}
                        colorScheme={rec.score >= 80 ? 'green' : rec.score >= 60 ? 'yellow' : 'red'}
                        size="sm"
                        borderRadius="full"
                        mb={2}
                      />

                      <HStack flexWrap="wrap" spacing={2}>
                        {rec.reasons.map((reason, i) => (
                          <Badge key={i} variant="outline" fontSize="xs">
                            {reason}
                          </Badge>
                        ))}
                      </HStack>

                      <HStack mt={3} fontSize="xs" color="gray.500" flexWrap="wrap">
                        <Text>Context: {formatTokenCount(rec.model.contextWindow)}</Text>
                        <Text>|</Text>
                        <Text>Risk: {rec.model.riskLevelDisplay}</Text>
                        <Text>|</Text>
                        <Text>In: {formatPrice(rec.model.inputPricePerMillion)}/M</Text>
                        <Text>|</Text>
                        <Text>Out: {formatPrice(rec.model.outputPricePerMillion)}/M</Text>
                      </HStack>

                      <Button
                        size="sm"
                        mt={3}
                        leftIcon={<MdAdd />}
                        onClick={() => handleAddModel(rec.model.modelId)}
                        isDisabled={selectedModels.includes(rec.model.modelId)}
                      >
                        Add to Compare
                      </Button>
                    </Box>
                  ))}
                </VStack>
              </CardBody>
            </Card>
          </TabPanel>

          {/* Cost Calculator Tab */}
          <TabPanel p={0} pt={4}>
            <Card bg={bgColor}>
              <CardHeader>
                <Heading size="md">
                  <HStack>
                    <Icon as={MdAttachMoney} color="green.500" />
                    <Text>Cost Calculator</Text>
                  </HStack>
                </Heading>
              </CardHeader>
              <CardBody>
                {/* Usage Inputs */}
                <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4} mb={6}>
                  <Box>
                    <Text fontSize="sm" fontWeight="500" mb={2}>
                      Daily Requests
                    </Text>
                    <NumberInput
                      value={usage.dailyRequests}
                      onChange={(_, val) => setUsage({ ...usage, dailyRequests: val || 0 })}
                      min={0}
                      max={1000000}
                    >
                      <NumberInputField />
                      <NumberInputStepper>
                        <NumberIncrementStepper />
                        <NumberDecrementStepper />
                      </NumberInputStepper>
                    </NumberInput>
                  </Box>
                  <Box>
                    <Text fontSize="sm" fontWeight="500" mb={2}>
                      Avg Input Tokens
                    </Text>
                    <NumberInput
                      value={usage.avgInputTokens}
                      onChange={(_, val) => setUsage({ ...usage, avgInputTokens: val || 0 })}
                      min={0}
                      max={100000}
                    >
                      <NumberInputField />
                      <NumberInputStepper>
                        <NumberIncrementStepper />
                        <NumberDecrementStepper />
                      </NumberInputStepper>
                    </NumberInput>
                  </Box>
                  <Box>
                    <Text fontSize="sm" fontWeight="500" mb={2}>
                      Avg Output Tokens
                    </Text>
                    <NumberInput
                      value={usage.avgOutputTokens}
                      onChange={(_, val) => setUsage({ ...usage, avgOutputTokens: val || 0 })}
                      min={0}
                      max={50000}
                    >
                      <NumberInputField />
                      <NumberInputStepper>
                        <NumberIncrementStepper />
                        <NumberDecrementStepper />
                      </NumberInputStepper>
                    </NumberInput>
                  </Box>
                </SimpleGrid>

                <Divider my={4} />

                {/* Cost Breakdown */}
                <Text fontWeight="500" mb={4}>Monthly Cost Estimates</Text>

                {allModels.length > 0 ? (
                  <TableContainer>
                    <Table size="sm">
                      <Thead>
                        <Tr>
                          <Th>Model</Th>
                          <Th>Provider</Th>
                          <Th isNumeric>Input Cost</Th>
                          <Th isNumeric>Output Cost</Th>
                          <Th isNumeric>Total/Month</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {allModels
                          .sort((a, b) => calculateMonthlyCost(a, usage) - calculateMonthlyCost(b, usage))
                          .slice(0, 15)
                          .map((model, index) => {
                            const monthlyRequests = usage.dailyRequests * 30;
                            const inputCost = (monthlyRequests * usage.avgInputTokens / 1000000) * (model.inputPricePerMillion || 0);
                            const outputCost = (monthlyRequests * usage.avgOutputTokens / 1000000) * (model.outputPricePerMillion || 0);
                            const total = inputCost + outputCost;

                            return (
                              <Tr key={model.modelId} bg={index === 0 ? topRowBg : undefined}>
                                <Td>
                                  <HStack>
                                    {index === 0 && <Icon as={MdStar} color="green.500" />}
                                    <Text fontWeight={index === 0 ? 'bold' : 'normal'}>
                                      {model.name}
                                    </Text>
                                  </HStack>
                                </Td>
                                <Td>{model.providerName}</Td>
                                <Td isNumeric>${inputCost.toFixed(2)}</Td>
                                <Td isNumeric>${outputCost.toFixed(2)}</Td>
                                <Td isNumeric fontWeight="500">${total.toFixed(2)}</Td>
                              </Tr>
                            );
                          })}
                      </Tbody>
                    </Table>
                  </TableContainer>
                ) : (
                  <Alert status="info">
                    <AlertIcon />
                    Loading model data...
                  </Alert>
                )}

                <Alert status="info" mt={4}>
                  <AlertIcon as={MdInfo} />
                  <Text fontSize="sm">
                    Costs are estimates based on {(usage.dailyRequests * 30).toLocaleString()} monthly requests
                    with average {usage.avgInputTokens.toLocaleString()} input and {usage.avgOutputTokens.toLocaleString()} output tokens per request.
                  </Text>
                </Alert>
              </CardBody>
            </Card>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </VStack>
  );
}
