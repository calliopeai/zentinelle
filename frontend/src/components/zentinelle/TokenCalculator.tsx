'use client';

import {
  Box,
  VStack,
  HStack,
  Text,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Select,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Divider,
  Badge,
  Tooltip,
  Icon,
  useColorModeValue,
  SimpleGrid,
  Progress,
  Collapse,
  Button,
  Flex,
} from '@chakra-ui/react';
import { useQuery } from '@apollo/client';
import { useState, useMemo, useEffect } from 'react';
import { MdInfo, MdExpandMore, MdExpandLess, MdWarning } from 'react-icons/md';
import { GET_AI_MODELS } from 'graphql/models';

interface AIModel {
  modelId: string;
  name: string;
  providerName: string;
  contextWindow: number | null;
  maxOutputTokens: number | null;
  inputPricePerMillion: number | null;
  outputPricePerMillion: number | null;
}

interface TokenCalculatorProps {
  text?: string;
  estimatedOutputTokens?: number;
  selectedModelId?: string;
  onModelChange?: (modelId: string) => void;
  compact?: boolean;
}

// Simple token estimator (approximation: ~4 chars per token for English)
function estimateTokens(text: string): number {
  if (!text) return 0;
  // More accurate estimation based on common patterns
  const words = text.split(/\s+/).filter(Boolean).length;
  const chars = text.length;
  // Average: ~0.75 tokens per word, or ~4 chars per token
  return Math.ceil(Math.max(words * 0.75, chars / 4));
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString();
}

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

export default function TokenCalculator({
  text = '',
  estimatedOutputTokens = 500,
  selectedModelId,
  onModelChange,
  compact = false,
}: TokenCalculatorProps) {
  const [modelId, setModelId] = useState(selectedModelId || 'gpt-4o');
  const [requestsPerDay, setRequestsPerDay] = useState(100);
  const [avgOutputTokens, setAvgOutputTokens] = useState(estimatedOutputTokens);
  const [isExpanded, setIsExpanded] = useState(!compact);

  const cardBg = useColorModeValue('white', 'navy.800');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.200');
  const statBg = useColorModeValue('gray.50', 'whiteAlpha.50');

  // Fetch models for pricing
  const { data } = useQuery(GET_AI_MODELS, {
    variables: { first: 100, availableOnly: true },
    fetchPolicy: 'cache-first',
  });

  const models: AIModel[] = useMemo(() => {
    return data?.aiModels?.edges?.map((e: { node: AIModel }) => e.node) || [];
  }, [data]);

  // Get selected model
  const selectedModel = useMemo(() => {
    return models.find((m) => m.modelId === modelId);
  }, [models, modelId]);

  // Calculate tokens
  const inputTokens = useMemo(() => estimateTokens(text), [text]);

  // Calculate costs
  const calculations = useMemo(() => {
    if (!selectedModel) {
      return {
        costPerRequest: 0,
        dailyCost: 0,
        monthlyCost: 0,
        contextUsage: 0,
      };
    }

    const inputPrice = selectedModel.inputPricePerMillion || 0;
    const outputPrice = selectedModel.outputPricePerMillion || 0;
    const contextWindow = selectedModel.contextWindow || 128000;

    // Cost per request
    const inputCost = (inputTokens / 1000000) * inputPrice;
    const outputCost = (avgOutputTokens / 1000000) * outputPrice;
    const costPerRequest = inputCost + outputCost;

    // Projections
    const dailyCost = costPerRequest * requestsPerDay;
    const monthlyCost = dailyCost * 30;

    // Context usage percentage
    const totalTokensPerRequest = inputTokens + avgOutputTokens;
    const contextUsage = (totalTokensPerRequest / contextWindow) * 100;

    return {
      costPerRequest,
      dailyCost,
      monthlyCost,
      contextUsage,
      inputCost,
      outputCost,
      contextWindow,
      totalTokensPerRequest,
    };
  }, [selectedModel, inputTokens, avgOutputTokens, requestsPerDay]);

  // Handle model change
  const handleModelChange = (newModelId: string) => {
    setModelId(newModelId);
    onModelChange?.(newModelId);
  };

  // Sync with prop
  useEffect(() => {
    if (selectedModelId && selectedModelId !== modelId) {
      setModelId(selectedModelId);
    }
  }, [selectedModelId]);

  // Group models by provider
  const groupedModels = useMemo(() => {
    return models.reduce((acc, model) => {
      const provider = model.providerName;
      if (!acc[provider]) acc[provider] = [];
      acc[provider].push(model);
      return acc;
    }, {} as Record<string, AIModel[]>);
  }, [models]);

  if (compact) {
    return (
      <Box
        p="12px"
        bg={statBg}
        borderRadius="md"
        border="1px solid"
        borderColor={borderColor}
      >
        <Flex justify="space-between" align="center" mb={isExpanded ? '12px' : '0'}>
          <HStack>
            <Text fontWeight="600" fontSize="sm">
              Token Calculator
            </Text>
            <Badge colorScheme="blue">{formatNumber(inputTokens)} tokens</Badge>
          </HStack>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => setIsExpanded(!isExpanded)}
            rightIcon={<Icon as={isExpanded ? MdExpandLess : MdExpandMore} />}
          >
            {isExpanded ? 'Less' : 'More'}
          </Button>
        </Flex>
        <Collapse in={isExpanded}>
          <VStack spacing="8px" align="stretch">
            <HStack justify="space-between" fontSize="sm">
              <Text color="gray.500">Per Request:</Text>
              <Text fontWeight="600">{formatCost(calculations.costPerRequest)}</Text>
            </HStack>
            <HStack justify="space-between" fontSize="sm">
              <Text color="gray.500">Est. Monthly:</Text>
              <Text fontWeight="600" color="brand.500">
                {formatCost(calculations.monthlyCost)}
              </Text>
            </HStack>
          </VStack>
        </Collapse>
      </Box>
    );
  }

  return (
    <Box
      p="16px"
      bg={cardBg}
      borderRadius="lg"
      border="1px solid"
      borderColor={borderColor}
    >
      <VStack spacing="16px" align="stretch">
        {/* Header */}
        <HStack justify="space-between">
          <Text fontWeight="600" fontSize="lg">
            Token & Cost Calculator
          </Text>
          <Tooltip label="Estimates based on ~4 characters per token">
            <span>
              <Icon as={MdInfo} color="gray.400" />
            </span>
          </Tooltip>
        </HStack>

        {/* Model Selection */}
        <Box>
          <Text fontSize="sm" fontWeight="500" mb="8px">
            Select Model
          </Text>
          <Select
            value={modelId}
            onChange={(e) => handleModelChange(e.target.value)}
            size="sm"
          >
            {Object.entries(groupedModels).map(([provider, providerModels]) => (
              <optgroup key={provider} label={provider}>
                {providerModels.map((model) => (
                  <option key={model.modelId} value={model.modelId}>
                    {model.name} (${model.inputPricePerMillion || 0}/${model.outputPricePerMillion || 0} per M)
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Box>

        <Divider />

        {/* Token Stats */}
        <SimpleGrid columns={2} spacing="12px">
          <Stat size="sm" bg={statBg} p="12px" borderRadius="md">
            <StatLabel>Input Tokens</StatLabel>
            <StatNumber fontSize="xl">{formatNumber(inputTokens)}</StatNumber>
            <StatHelpText>{formatCost(calculations.inputCost || 0)}</StatHelpText>
          </Stat>
          <Stat size="sm" bg={statBg} p="12px" borderRadius="md">
            <StatLabel>Est. Output Tokens</StatLabel>
            <StatNumber fontSize="xl">{formatNumber(avgOutputTokens)}</StatNumber>
            <StatHelpText>{formatCost(calculations.outputCost || 0)}</StatHelpText>
          </Stat>
        </SimpleGrid>

        {/* Context Usage */}
        <Box>
          <HStack justify="space-between" mb="4px">
            <Text fontSize="sm" color="gray.500">
              Context Window Usage
            </Text>
            <Text fontSize="sm" fontWeight="600">
              {calculations.contextUsage.toFixed(1)}%
            </Text>
          </HStack>
          <Progress
            value={calculations.contextUsage}
            size="sm"
            colorScheme={
              calculations.contextUsage > 80
                ? 'red'
                : calculations.contextUsage > 50
                ? 'yellow'
                : 'green'
            }
            borderRadius="full"
          />
          <Text fontSize="xs" color="gray.500" mt="4px">
            {formatNumber(calculations.totalTokensPerRequest || 0)} /{' '}
            {formatNumber(calculations.contextWindow || 0)} tokens
          </Text>
          {calculations.contextUsage > 80 && (
            <HStack mt="8px" color="orange.500" fontSize="xs">
              <Icon as={MdWarning} />
              <Text>High context usage may cause truncation</Text>
            </HStack>
          )}
        </Box>

        <Divider />

        {/* Cost Projections */}
        <Box>
          <Text fontSize="sm" fontWeight="500" mb="12px">
            Cost Projections
          </Text>
          <HStack mb="12px">
            <Text fontSize="sm" color="gray.500">
              Requests per day:
            </Text>
            <NumberInput
              size="sm"
              maxW="100px"
              value={requestsPerDay}
              onChange={(_, val) => setRequestsPerDay(isNaN(val) ? 0 : val)}
              min={1}
              max={100000}
            >
              <NumberInputField />
              <NumberInputStepper>
                <NumberIncrementStepper />
                <NumberDecrementStepper />
              </NumberInputStepper>
            </NumberInput>
          </HStack>
          <HStack mb="12px">
            <Text fontSize="sm" color="gray.500">
              Avg output tokens:
            </Text>
            <NumberInput
              size="sm"
              maxW="100px"
              value={avgOutputTokens}
              onChange={(_, val) => setAvgOutputTokens(isNaN(val) ? 0 : val)}
              min={1}
              max={100000}
            >
              <NumberInputField />
              <NumberInputStepper>
                <NumberIncrementStepper />
                <NumberDecrementStepper />
              </NumberInputStepper>
            </NumberInput>
          </HStack>

          <SimpleGrid columns={3} spacing="12px">
            <Stat size="sm" bg={statBg} p="12px" borderRadius="md" textAlign="center">
              <StatLabel>Per Request</StatLabel>
              <StatNumber fontSize="lg">
                {formatCost(calculations.costPerRequest)}
              </StatNumber>
            </Stat>
            <Stat size="sm" bg={statBg} p="12px" borderRadius="md" textAlign="center">
              <StatLabel>Daily</StatLabel>
              <StatNumber fontSize="lg">
                {formatCost(calculations.dailyCost)}
              </StatNumber>
            </Stat>
            <Stat
              size="sm"
              bg="brand.50"
              p="12px"
              borderRadius="md"
              textAlign="center"
            >
              <StatLabel>Monthly</StatLabel>
              <StatNumber fontSize="lg" color="brand.600">
                {formatCost(calculations.monthlyCost)}
              </StatNumber>
            </Stat>
          </SimpleGrid>
        </Box>
      </VStack>
    </Box>
  );
}
