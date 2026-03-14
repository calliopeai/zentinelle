'use client';

import {
  Box,
  VStack,
  HStack,
  Text,
  Checkbox,
  Input,
  InputGroup,
  InputLeftElement,
  Icon,
  Badge,
  Spinner,
  Select,
  Flex,
  Collapse,
  Button,
  useColorModeValue,
  Tag,
  TagLabel,
  TagCloseButton,
  Wrap,
  WrapItem,
  Tooltip,
} from '@chakra-ui/react';
import { useQuery } from '@apollo/client';
import { useState, useMemo } from 'react';
import { MdSearch, MdExpandMore, MdExpandLess } from 'react-icons/md';
import { GET_AI_MODELS, PROVIDER_OPTIONS, RISK_LEVEL_OPTIONS } from 'graphql/models';

interface AIModel {
  id: string;
  modelId: string;
  name: string;
  providerSlug: string;
  providerName: string;
  riskLevel: string;
  riskLevelDisplay: string;
  inputPricePerMillion: number | null;
  outputPricePerMillion: number | null;
  deprecated: boolean;
  capabilities: string[];
}

interface ModelSelectorProps {
  selectedModels: string[];
  onChange: (models: string[]) => void;
  mode: 'allowed' | 'blocked';
  placeholder?: string;
}

function formatPrice(price: number | null): string {
  if (price === null) return '-';
  if (price < 1) return `$${price.toFixed(3)}`;
  return `$${price.toFixed(2)}`;
}

function getRiskColor(riskLevel: string): string {
  const option = RISK_LEVEL_OPTIONS.find((o) => o.value === riskLevel);
  return option?.color || 'gray';
}

export default function ModelSelector({
  selectedModels,
  onChange,
  mode,
  placeholder = 'Search models...',
}: ModelSelectorProps) {
  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);

  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.200');
  const hoverBg = useColorModeValue('gray.50', 'whiteAlpha.100');
  const selectedBg = useColorModeValue('brand.50', 'brand.900');

  const { data, loading } = useQuery(GET_AI_MODELS, {
    variables: {
      first: 200,
      availableOnly: true,
      providerSlug: providerFilter || undefined,
    },
    fetchPolicy: 'cache-first',
  });

  const models: AIModel[] = useMemo(() => {
    return data?.aiModels?.edges?.map((e: { node: AIModel }) => e.node) || [];
  }, [data]);

  // Filter models by search
  const filteredModels = useMemo(() => {
    if (!search) return models;
    const searchLower = search.toLowerCase();
    return models.filter(
      (m) =>
        m.name.toLowerCase().includes(searchLower) ||
        m.modelId.toLowerCase().includes(searchLower) ||
        m.providerName.toLowerCase().includes(searchLower)
    );
  }, [models, search]);

  // Group by provider
  const groupedModels = useMemo(() => {
    return filteredModels.reduce((acc, model) => {
      const provider = model.providerName;
      if (!acc[provider]) acc[provider] = [];
      acc[provider].push(model);
      return acc;
    }, {} as Record<string, AIModel[]>);
  }, [filteredModels]);

  const handleToggle = (modelId: string) => {
    if (selectedModels.includes(modelId)) {
      onChange(selectedModels.filter((m) => m !== modelId));
    } else {
      onChange([...selectedModels, modelId]);
    }
  };

  const handleRemove = (modelId: string) => {
    onChange(selectedModels.filter((m) => m !== modelId));
  };

  const handleSelectAll = (provider: string) => {
    const providerModels = groupedModels[provider] || [];
    const providerModelIds = providerModels.map((m) => m.modelId);
    const allSelected = providerModelIds.every((id) => selectedModels.includes(id));

    if (allSelected) {
      onChange(selectedModels.filter((m) => !providerModelIds.includes(m)));
    } else {
      const newSelection = [...new Set([...selectedModels, ...providerModelIds])];
      onChange(newSelection);
    }
  };

  // Get selected model details for tags
  const selectedModelDetails = useMemo(() => {
    return selectedModels.map((modelId) => {
      const model = models.find((m) => m.modelId === modelId);
      return model || { modelId, name: modelId, providerName: 'Unknown' };
    });
  }, [selectedModels, models]);

  return (
    <Box>
      {/* Selected Models Tags */}
      {selectedModels.length > 0 && (
        <Wrap spacing="8px" mb="12px">
          {selectedModelDetails.map((model) => (
            <WrapItem key={model.modelId}>
              <Tag
                size="md"
                colorScheme={mode === 'allowed' ? 'green' : 'red'}
                borderRadius="full"
              >
                <TagLabel>
                  {model.name}
                  <Text as="span" fontSize="xs" color="gray.500" ml="4px">
                    ({(model as AIModel).providerName || 'Unknown'})
                  </Text>
                </TagLabel>
                <TagCloseButton onClick={() => handleRemove(model.modelId)} />
              </Tag>
            </WrapItem>
          ))}
        </Wrap>
      )}

      {/* Header with expand/collapse */}
      <Flex
        justify="space-between"
        align="center"
        p="8px"
        bg={useColorModeValue('gray.50', 'whiteAlpha.50')}
        borderRadius="md"
        cursor="pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <HStack>
          <Text fontWeight="500" fontSize="sm">
            {mode === 'allowed' ? 'Select Allowed Models' : 'Select Blocked Models'}
          </Text>
          <Badge colorScheme={mode === 'allowed' ? 'green' : 'red'}>
            {selectedModels.length} selected
          </Badge>
        </HStack>
        <Icon as={isExpanded ? MdExpandLess : MdExpandMore} />
      </Flex>

      <Collapse in={isExpanded} animateOpacity>
        <Box
          border="1px solid"
          borderColor={borderColor}
          borderRadius="md"
          mt="8px"
          maxH="400px"
          overflowY="auto"
        >
          {/* Search and Filter */}
          <Box p="12px" borderBottom="1px solid" borderColor={borderColor}>
            <HStack spacing="12px">
              <InputGroup size="sm" flex="1">
                <InputLeftElement pointerEvents="none">
                  <Icon as={MdSearch} color="gray.400" />
                </InputLeftElement>
                <Input
                  placeholder={placeholder}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </InputGroup>
              <Select
                size="sm"
                maxW="160px"
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
          </Box>

          {/* Model List */}
          {loading ? (
            <Flex justify="center" p="20px">
              <Spinner size="sm" />
            </Flex>
          ) : Object.keys(groupedModels).length === 0 ? (
            <Box p="20px" textAlign="center">
              <Text color="gray.500" fontSize="sm">
                No models found
              </Text>
            </Box>
          ) : (
            <VStack spacing="0" align="stretch">
              {Object.entries(groupedModels).map(([provider, providerModels]) => {
                const allSelected = providerModels.every((m) =>
                  selectedModels.includes(m.modelId)
                );
                const someSelected = providerModels.some((m) =>
                  selectedModels.includes(m.modelId)
                );

                return (
                  <Box key={provider}>
                    {/* Provider Header */}
                    <Flex
                      px="12px"
                      py="8px"
                      bg={useColorModeValue('gray.100', 'whiteAlpha.100')}
                      align="center"
                      justify="space-between"
                    >
                      <HStack>
                        <Checkbox
                          isChecked={allSelected}
                          isIndeterminate={someSelected && !allSelected}
                          onChange={() => handleSelectAll(provider)}
                          colorScheme="brand"
                          size="sm"
                        />
                        <Text fontWeight="600" fontSize="sm">
                          {provider}
                        </Text>
                        <Badge colorScheme="gray" fontSize="10px">
                          {providerModels.length}
                        </Badge>
                      </HStack>
                    </Flex>

                    {/* Provider Models */}
                    {providerModels.map((model) => {
                      const isSelected = selectedModels.includes(model.modelId);
                      return (
                        <Flex
                          key={model.id}
                          px="12px"
                          py="8px"
                          pl="32px"
                          align="center"
                          justify="space-between"
                          bg={isSelected ? selectedBg : 'transparent'}
                          _hover={{ bg: isSelected ? selectedBg : hoverBg }}
                          cursor="pointer"
                          onClick={() => handleToggle(model.modelId)}
                          borderBottom="1px solid"
                          borderColor={borderColor}
                        >
                          <HStack spacing="12px" flex="1">
                            <Checkbox
                              isChecked={isSelected}
                              onChange={() => handleToggle(model.modelId)}
                              colorScheme="brand"
                              size="sm"
                              onClick={(e) => e.stopPropagation()}
                            />
                            <VStack align="start" spacing="0">
                              <HStack>
                                <Text fontSize="sm" fontWeight="500">
                                  {model.name}
                                </Text>
                                {model.deprecated && (
                                  <Badge colorScheme="red" fontSize="9px">
                                    Deprecated
                                  </Badge>
                                )}
                              </HStack>
                              <Text fontSize="xs" color="gray.500">
                                {model.modelId}
                              </Text>
                            </VStack>
                          </HStack>

                          <HStack spacing="12px">
                            <Tooltip label={`Risk: ${model.riskLevelDisplay}`}>
                              <Badge
                                colorScheme={getRiskColor(model.riskLevel)}
                                fontSize="9px"
                              >
                                {model.riskLevelDisplay}
                              </Badge>
                            </Tooltip>
                            <VStack spacing="0" align="end">
                              <Text fontSize="10px" color="gray.500">
                                In: {formatPrice(model.inputPricePerMillion)}/M
                              </Text>
                              <Text fontSize="10px" color="gray.500">
                                Out: {formatPrice(model.outputPricePerMillion)}/M
                              </Text>
                            </VStack>
                          </HStack>
                        </Flex>
                      );
                    })}
                  </Box>
                );
              })}
            </VStack>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}
