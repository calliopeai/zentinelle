'use client';

import {
  Box,
  Button,
  Flex,
  Icon,
  Text,
  useColorModeValue,
  Badge,
  SimpleGrid,
  Spinner,
  VStack,
  HStack,
  Input,
  InputGroup,
  InputLeftElement,
  Select,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Code,
  IconButton,
  Tooltip,
  useToast,
  Wrap,
  WrapItem,
  Divider,
} from '@chakra-ui/react';
import { useQuery, useMutation } from '@apollo/client';
import { useState, useMemo } from 'react';
import {
  MdAdd,
  MdSearch,
  MdRefresh,
  MdEdit,
  MdContentCopy,
  MdCode,
  MdPerson,
  MdSecurity,
  MdInfo,
  MdAutoAwesome,
  MdList,
  MdMerge,
  MdDataUsage,
  MdStar,
  MdStarBorder,
  MdForkRight,
  MdVerified,
  MdLocalOffer,
  MdCategory,
  MdTune,
  MdTrendingUp,
  MdFavorite,
  MdFavoriteBorder,
  MdClose,
} from 'react-icons/md';
import Card from 'components/card/Card';
import TokenCalculator from 'components/zentinelle/TokenCalculator';
import PromptGenerator from 'components/zentinelle/PromptGenerator';
import PromptReconciler from 'components/zentinelle/PromptReconciler';
import PolicyOverheadDashboard from 'components/zentinelle/PolicyOverheadDashboard';
import {
  GET_SYSTEM_PROMPTS,
  GET_PROMPT_CATEGORIES,
  GET_PROMPT_TAGS,
  FORK_SYSTEM_PROMPT,
  TOGGLE_PROMPT_FAVORITE,
  PROMPT_TYPE_OPTIONS,
  PROVIDER_OPTIONS,
} from 'graphql/prompts';
import { usePageHeader } from 'contexts/PageHeaderContext';

interface PromptTag {
  id: string;
  name: string;
  slug: string;
  tagType: string;
  color: string;
}

interface PromptCategory {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
}

interface SystemPrompt {
  id: string;
  name: string;
  slug: string;
  description: string;
  promptText: string;
  promptType: string;
  promptTypeDisplay: string;
  category: PromptCategory | null;
  tags: { edges: { node: PromptTag }[] };
  compatibleProviders: string[];
  compatibleModels: string[];
  recommendedTemperature: number | null;
  recommendedMaxTokens: number | null;
  templateVariables: string[];
  variableDefaults: Record<string, string>;
  exampleInput: string;
  exampleOutput: string;
  useCases: string[];
  version: number;
  status: string;
  statusDisplay: string;
  visibility: string;
  visibilityDisplay: string;
  isFeatured: boolean;
  isVerified: boolean;
  usageCount: number;
  favoriteCount: number;
  forkCount: number;
  avgRating: number | null;
  isFavorited: boolean;
  userRating: number | null;
  createdByUsername: string | null;
  createdAt: string;
  updatedAt: string;
}

function getTypeIcon(promptType: string) {
  switch (promptType) {
    case 'system':
      return MdCode;
    case 'persona':
      return MdPerson;
    case 'task':
      return MdTune;
    case 'safety':
      return MdSecurity;
    case 'few_shot':
      return MdList;
    case 'format':
      return MdInfo;
    default:
      return MdCode;
  }
}

function getTypeColor(promptType: string): string {
  switch (promptType) {
    case 'system':
      return 'blue';
    case 'persona':
      return 'purple';
    case 'task':
      return 'green';
    case 'safety':
      return 'red';
    case 'few_shot':
      return 'orange';
    case 'format':
      return 'cyan';
    default:
      return 'gray';
  }
}

function getProviderColor(provider: string): string {
  const opt = PROVIDER_OPTIONS.find(p => p.value === provider);
  return opt?.color || 'gray';
}

function truncateText(text: string, maxLength: number = 150): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

function PromptCard({
  prompt,
  textColor,
  cardBg,
  borderColor,
  onView,
  onFork,
  onToggleFavorite,
  isForking,
}: {
  prompt: SystemPrompt;
  textColor: string;
  cardBg: string;
  borderColor: string;
  onView: (prompt: SystemPrompt) => void;
  onFork: (prompt: SystemPrompt) => void;
  onToggleFavorite: (prompt: SystemPrompt) => void;
  isForking?: boolean;
}) {
  const TypeIcon = getTypeIcon(prompt.promptType);
  const tags = prompt.tags?.edges?.map(e => e.node) || [];

  return (
    <Card
      p="20px"
      bg={cardBg}
      cursor="pointer"
      onClick={() => onView(prompt)}
      _hover={{ borderColor: 'brand.400', transform: 'translateY(-2px)' }}
      transition="all 0.2s"
      borderWidth="1px"
      borderColor={borderColor}
    >
      <Flex justify="space-between" align="flex-start" mb="12px">
        <HStack spacing="12px">
          <Box
            p="8px"
            borderRadius="8px"
            bg={`${getTypeColor(prompt.promptType)}.100`}
          >
            <Icon
              as={TypeIcon}
              color={`${getTypeColor(prompt.promptType)}.500`}
              boxSize="20px"
            />
          </Box>
          <Box>
            <HStack spacing="8px">
              <Text fontWeight="600" color={textColor} fontSize="md">
                {prompt.name}
              </Text>
              {prompt.isVerified && (
                <Icon as={MdVerified} color="blue.500" boxSize="16px" />
              )}
              {prompt.isFeatured && (
                <Icon as={MdStar} color="yellow.500" boxSize="16px" />
              )}
            </HStack>
            <Text fontSize="xs" color="gray.500">
              v{prompt.version} • {prompt.usageCount} uses
            </Text>
          </Box>
        </HStack>
        {prompt.category && (
          <Badge colorScheme={prompt.category.color} fontSize="10px">
            {prompt.category.name}
          </Badge>
        )}
      </Flex>

      <Text fontSize="sm" color="gray.500" mb="12px" noOfLines={2}>
        {prompt.description || truncateText(prompt.promptText)}
      </Text>

      {/* Provider badges */}
      {prompt.compatibleProviders.length > 0 && (
        <HStack spacing="4px" mb="12px" flexWrap="wrap">
          {prompt.compatibleProviders.slice(0, 4).map(provider => (
            <Badge
              key={provider}
              colorScheme={getProviderColor(provider)}
              fontSize="9px"
              variant="subtle"
            >
              {provider}
            </Badge>
          ))}
          {prompt.compatibleProviders.length > 4 && (
            <Badge colorScheme="gray" fontSize="9px" variant="subtle">
              +{prompt.compatibleProviders.length - 4}
            </Badge>
          )}
        </HStack>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <HStack spacing="4px" mb="12px" flexWrap="wrap">
          {tags.slice(0, 3).map(tag => (
            <Badge
              key={tag.id}
              colorScheme={tag.color}
              fontSize="9px"
              variant="outline"
            >
              {tag.name}
            </Badge>
          ))}
          {tags.length > 3 && (
            <Badge colorScheme="gray" fontSize="9px" variant="outline">
              +{tags.length - 3}
            </Badge>
          )}
        </HStack>
      )}

      <Flex justify="space-between" align="center">
        <HStack spacing="12px" fontSize="xs" color="gray.500">
          <HStack spacing="4px">
            <Icon as={MdStar} />
            <Text>{prompt.favoriteCount}</Text>
          </HStack>
          <HStack spacing="4px">
            <Icon as={MdForkRight} />
            <Text>{prompt.forkCount}</Text>
          </HStack>
          {prompt.avgRating && (
            <HStack spacing="4px">
              <Text>{prompt.avgRating.toFixed(1)}</Text>
            </HStack>
          )}
        </HStack>
        <HStack spacing="4px">
          <Tooltip label={prompt.isFavorited ? 'Remove from favorites' : 'Add to favorites'}>
            <IconButton
              aria-label="Toggle favorite"
              icon={prompt.isFavorited ? <MdStar /> : <MdStarBorder />}
              size="sm"
              variant="ghost"
              color={prompt.isFavorited ? 'yellow.500' : 'gray.400'}
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(prompt);
              }}
            />
          </Tooltip>
          <Tooltip label="Fork this prompt">
            <IconButton
              aria-label="Fork"
              icon={<MdForkRight />}
              size="sm"
              variant="ghost"
              isLoading={isForking}
              onClick={(e) => {
                e.stopPropagation();
                onFork(prompt);
              }}
            />
          </Tooltip>
          <Tooltip label="View details">
            <IconButton
              aria-label="View"
              icon={<MdEdit />}
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                onView(prompt);
              }}
            />
          </Tooltip>
        </HStack>
      </Flex>
    </Card>
  );
}

function PromptDetailModal({
  prompt,
  isOpen,
  onClose,
  textColor,
}: {
  prompt: SystemPrompt | null;
  isOpen: boolean;
  onClose: () => void;
  textColor: string;
}) {
  const toast = useToast();
  if (!prompt) return null;

  const tags = prompt.tags?.edges?.map(e => e.node) || [];

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>
          <HStack spacing="12px">
            <Icon
              as={getTypeIcon(prompt.promptType)}
              color={`${getTypeColor(prompt.promptType)}.500`}
            />
            <Box>
              <HStack>
                <Text>{prompt.name}</Text>
                {prompt.isVerified && <Icon as={MdVerified} color="blue.500" />}
              </HStack>
              <Text fontSize="sm" fontWeight="400" color="gray.500">
                v{prompt.version} • {prompt.statusDisplay} • {prompt.visibilityDisplay}
              </Text>
            </Box>
          </HStack>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Tabs>
            <TabList>
              <Tab>Content</Tab>
              <Tab>Compatibility</Tab>
              <Tab>Usage</Tab>
            </TabList>
            <TabPanels>
              <TabPanel px="0">
                {prompt.description && (
                  <Box mb="16px">
                    <Text fontSize="sm" fontWeight="500" mb="4px">
                      Description
                    </Text>
                    <Text fontSize="sm" color="gray.500">
                      {prompt.description}
                    </Text>
                  </Box>
                )}
                <Box mb="16px">
                  <Text fontSize="sm" fontWeight="500" mb="4px">
                    Prompt Text
                  </Text>
                  <Code
                    display="block"
                    whiteSpace="pre-wrap"
                    p="12px"
                    borderRadius="8px"
                    fontSize="sm"
                    maxH="300px"
                    overflow="auto"
                  >
                    {prompt.promptText}
                  </Code>
                </Box>
                <Box mb="16px">
                  <TokenCalculator text={prompt.promptText} compact />
                </Box>
                {prompt.templateVariables.length > 0 && (
                  <Box mb="16px">
                    <Text fontSize="sm" fontWeight="500" mb="4px">
                      Template Variables
                    </Text>
                    <Wrap>
                      {prompt.templateVariables.map(v => (
                        <WrapItem key={v}>
                          <Badge variant="outline" colorScheme="purple">
                            {`{{${v}}}`}
                          </Badge>
                        </WrapItem>
                      ))}
                    </Wrap>
                  </Box>
                )}
                {prompt.exampleInput && (
                  <Box mb="16px">
                    <Text fontSize="sm" fontWeight="500" mb="4px">
                      Example Input
                    </Text>
                    <Code display="block" p="8px" borderRadius="4px" fontSize="sm">
                      {prompt.exampleInput}
                    </Code>
                  </Box>
                )}
                {prompt.exampleOutput && (
                  <Box mb="16px">
                    <Text fontSize="sm" fontWeight="500" mb="4px">
                      Example Output
                    </Text>
                    <Code display="block" p="8px" borderRadius="4px" fontSize="sm">
                      {prompt.exampleOutput}
                    </Code>
                  </Box>
                )}
              </TabPanel>
              <TabPanel px="0">
                <VStack align="stretch" spacing="16px">
                  <Box>
                    <Text fontSize="sm" fontWeight="500" mb="8px">
                      Compatible Providers
                    </Text>
                    {prompt.compatibleProviders.length > 0 ? (
                      <Wrap>
                        {prompt.compatibleProviders.map(p => (
                          <WrapItem key={p}>
                            <Badge colorScheme={getProviderColor(p)}>
                              {p}
                            </Badge>
                          </WrapItem>
                        ))}
                      </Wrap>
                    ) : (
                      <Text fontSize="sm" color="gray.500">All providers</Text>
                    )}
                  </Box>
                  <Box>
                    <Text fontSize="sm" fontWeight="500" mb="8px">
                      Compatible Models
                    </Text>
                    {prompt.compatibleModels.length > 0 ? (
                      <Wrap>
                        {prompt.compatibleModels.map(m => (
                          <WrapItem key={m}>
                            <Badge variant="outline">{m}</Badge>
                          </WrapItem>
                        ))}
                      </Wrap>
                    ) : (
                      <Text fontSize="sm" color="gray.500">All models</Text>
                    )}
                  </Box>
                  {prompt.recommendedTemperature !== null && (
                    <HStack justify="space-between">
                      <Text fontSize="sm" color="gray.500">Recommended Temperature</Text>
                      <Badge>{prompt.recommendedTemperature}</Badge>
                    </HStack>
                  )}
                  {prompt.recommendedMaxTokens !== null && (
                    <HStack justify="space-between">
                      <Text fontSize="sm" color="gray.500">Recommended Max Tokens</Text>
                      <Badge>{prompt.recommendedMaxTokens}</Badge>
                    </HStack>
                  )}
                  <Divider />
                  <Box>
                    <Text fontSize="sm" fontWeight="500" mb="8px">
                      Tags
                    </Text>
                    {tags.length > 0 ? (
                      <Wrap>
                        {tags.map(tag => (
                          <WrapItem key={tag.id}>
                            <Badge colorScheme={tag.color} variant="subtle">
                              {tag.name}
                            </Badge>
                          </WrapItem>
                        ))}
                      </Wrap>
                    ) : (
                      <Text fontSize="sm" color="gray.500">No tags</Text>
                    )}
                  </Box>
                </VStack>
              </TabPanel>
              <TabPanel px="0">
                <VStack align="stretch" spacing="12px">
                  <HStack justify="space-between">
                    <Text fontSize="sm" color="gray.500">Type</Text>
                    <Badge colorScheme={getTypeColor(prompt.promptType)}>
                      {prompt.promptTypeDisplay}
                    </Badge>
                  </HStack>
                  <HStack justify="space-between">
                    <Text fontSize="sm" color="gray.500">Category</Text>
                    <Text fontSize="sm">{prompt.category?.name || 'Uncategorized'}</Text>
                  </HStack>
                  <HStack justify="space-between">
                    <Text fontSize="sm" color="gray.500">Usage Count</Text>
                    <Text fontSize="sm">{prompt.usageCount}</Text>
                  </HStack>
                  <HStack justify="space-between">
                    <Text fontSize="sm" color="gray.500">Favorites</Text>
                    <Text fontSize="sm">{prompt.favoriteCount}</Text>
                  </HStack>
                  <HStack justify="space-between">
                    <Text fontSize="sm" color="gray.500">Forks</Text>
                    <Text fontSize="sm">{prompt.forkCount}</Text>
                  </HStack>
                  {prompt.avgRating && (
                    <HStack justify="space-between">
                      <Text fontSize="sm" color="gray.500">Average Rating</Text>
                      <HStack>
                        <Icon as={MdStar} color="yellow.500" />
                        <Text fontSize="sm">{prompt.avgRating.toFixed(1)}/5</Text>
                      </HStack>
                    </HStack>
                  )}
                  <Divider />
                  {prompt.useCases.length > 0 && (
                    <Box>
                      <Text fontSize="sm" fontWeight="500" mb="8px">Use Cases</Text>
                      <VStack align="stretch" spacing="4px">
                        {prompt.useCases.map((uc, i) => (
                          <Text key={i} fontSize="sm" color="gray.500">• {uc}</Text>
                        ))}
                      </VStack>
                    </Box>
                  )}
                  <Divider />
                  <HStack justify="space-between">
                    <Text fontSize="sm" color="gray.500">Created by</Text>
                    <Text fontSize="sm">{prompt.createdByUsername || 'System'}</Text>
                  </HStack>
                  <HStack justify="space-between">
                    <Text fontSize="sm" color="gray.500">Created</Text>
                    <Text fontSize="sm">{new Date(prompt.createdAt).toLocaleDateString()}</Text>
                  </HStack>
                </VStack>
              </TabPanel>
            </TabPanels>
          </Tabs>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr="12px" onClick={onClose}>
            Close
          </Button>
          <Button
            colorScheme="brand"
            leftIcon={<MdContentCopy />}
            onClick={() => {
              navigator.clipboard.writeText(prompt.promptText);
              toast({ title: 'Copied to clipboard', status: 'success', duration: 1500, isClosable: true });
            }}
          >
            Copy Prompt
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export default function SystemPromptsPage() {
  usePageHeader('Prompt Library', 'Discover and manage reusable prompts for AI agents');
  const cardBg = useColorModeValue('white', 'navy.800');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.100');

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [selectedPrompt, setSelectedPrompt] = useState<SystemPrompt | null>(null);
  const [quickFilter, setQuickFilter] = useState<'featured' | 'popular' | 'verified' | 'favorites' | null>(null);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const { isOpen, onOpen, onClose } = useDisclosure();

  const toast = useToast();

  // Fetch categories for filter dropdown
  const { data: categoriesData } = useQuery(GET_PROMPT_CATEGORIES, {
    variables: { activeOnly: true },
  });
  const categories = categoriesData?.promptCategories || [];

  const { data, loading, error, refetch } = useQuery(GET_SYSTEM_PROMPTS, {
    variables: {
      first: 50,
      search: search || undefined,
      systemPromptType: typeFilter || undefined,
      categorySlug: categoryFilter || undefined,
      provider: providerFilter || undefined,
      featuredOnly: quickFilter === 'featured' ? true : undefined,
      verifiedOnly: quickFilter === 'verified' ? true : undefined,
      favoritesOnly: quickFilter === 'favorites' ? true : undefined,
    },
    fetchPolicy: 'cache-and-network',
  });

  // Fetch featured prompts for the showcase (always fetch)
  const { data: featuredData } = useQuery(GET_SYSTEM_PROMPTS, {
    variables: { first: 6, featuredOnly: true },
    fetchPolicy: 'cache-and-network',
  });

  const [forkPrompt, { loading: forking }] = useMutation(FORK_SYSTEM_PROMPT, {
    onCompleted: (data) => {
      if (data?.forkSystemPrompt?.success) {
        toast({
          title: 'Prompt forked',
          description: 'The prompt has been forked to your library.',
          status: 'success',
          duration: 3000,
        });
        refetch();
      } else {
        toast({
          title: 'Error forking prompt',
          description: data?.forkSystemPrompt?.errors?.[0] || 'Unknown error',
          status: 'error',
          duration: 5000,
        });
      }
    },
    onError: (error) => {
      toast({
        title: 'Error forking prompt',
        description: error.message,
        status: 'error',
        duration: 5000,
      });
    },
  });

  const [toggleFavorite] = useMutation(TOGGLE_PROMPT_FAVORITE, {
    onCompleted: (data) => {
      if (data?.togglePromptFavorite?.success) {
        refetch();
      }
    },
  });

  const prompts: SystemPrompt[] =
    data?.systemPrompts?.edges?.map((e: { node: SystemPrompt }) => e.node) || [];

  const featuredPrompts: SystemPrompt[] =
    featuredData?.systemPrompts?.edges?.map((e: { node: SystemPrompt }) => e.node) || [];

  // Popular prompts: sorted by usage count (only compute when quickFilter is 'popular' or when showing showcase)
  const popularPrompts = useMemo(() => {
    if (quickFilter === 'popular') {
      // Sort the filtered results by usage count
      return [...prompts].sort((a, b) => b.usageCount - a.usageCount);
    }
    // For showcase: get top 6 by usage from all prompts
    return [...prompts]
      .filter(p => p.usageCount > 0)
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 6);
  }, [prompts, quickFilter]);

  // Show showcase sections only when no filters are active
  const showShowcase = !search && !typeFilter && !categoryFilter && !providerFilter && !quickFilter;

  const handleViewPrompt = (prompt: SystemPrompt) => {
    setSelectedPrompt(prompt);
    onOpen();
  };

  const handleFork = (prompt: SystemPrompt) => {
    forkPrompt({ variables: { id: prompt.id } });
  };

  const handleToggleFavorite = (prompt: SystemPrompt) => {
    toggleFavorite({ variables: { promptId: prompt.id } });
  };

  if (loading && !data) {
    return (
      <Box>
        <Flex justify="center" py="40px">
          <Spinner size="xl" color="brand.500" />
        </Flex>
      </Box>
    );
  }

  return (
    <Box>
      <Flex justify="flex-end" mb="20px">
        <HStack spacing="12px">
          <Button
            variant="outline"
            leftIcon={<Icon as={MdRefresh} />}
            onClick={() => refetch()}
            isLoading={loading}
          >
            Refresh
          </Button>
          <Button variant="brand" leftIcon={<Icon as={MdAdd} />} onClick={() => setActiveTabIndex(1)}>
            New Prompt
          </Button>
        </HStack>
      </Flex>

      {/* Tabs for Library and Builder */}
      <Tabs variant="enclosed" colorScheme="brand" mb="20px" index={activeTabIndex} onChange={setActiveTabIndex}>
        <TabList>
          <Tab><Icon as={MdList} mr="8px" />Library</Tab>
          <Tab><Icon as={MdAutoAwesome} mr="8px" />Builder</Tab>
          <Tab><Icon as={MdMerge} mr="8px" />Reconciler</Tab>
          <Tab><Icon as={MdDataUsage} mr="8px" />Token Overhead</Tab>
        </TabList>
        <TabPanels>
          <TabPanel px="0">

      {/* Filters */}
      <Card p="16px" bg={cardBg} mb="20px">
        <Flex gap="16px" flexWrap="wrap">
          <InputGroup maxW="300px">
            <InputLeftElement pointerEvents="none">
              <Icon as={MdSearch} color="gray.400" />
            </InputLeftElement>
            <Input
              placeholder="Search prompts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </InputGroup>
          <Select
            placeholder="All Types"
            maxW="180px"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            icon={<MdTune />}
          >
            {PROMPT_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
          <Select
            placeholder="All Categories"
            maxW="180px"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            icon={<MdCategory />}
          >
            {categories.map((cat: { slug: string; name: string }) => (
              <option key={cat.slug} value={cat.slug}>
                {cat.name}
              </option>
            ))}
          </Select>
          <Select
            placeholder="All Providers"
            maxW="180px"
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
            icon={<MdLocalOffer />}
          >
            {PROVIDER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </Flex>

        {/* Quick Filter Chips */}
        <Flex mt="12px" gap="8px" flexWrap="wrap" align="center">
          <Text fontSize="sm" color="gray.500" mr="4px">Quick filters:</Text>
          <Button
            size="xs"
            variant={quickFilter === 'featured' ? 'solid' : 'outline'}
            colorScheme={quickFilter === 'featured' ? 'yellow' : 'gray'}
            leftIcon={<Icon as={MdStar} />}
            onClick={() => setQuickFilter(quickFilter === 'featured' ? null : 'featured')}
          >
            Featured
          </Button>
          <Button
            size="xs"
            variant={quickFilter === 'popular' ? 'solid' : 'outline'}
            colorScheme={quickFilter === 'popular' ? 'orange' : 'gray'}
            leftIcon={<Icon as={MdTrendingUp} />}
            onClick={() => setQuickFilter(quickFilter === 'popular' ? null : 'popular')}
          >
            Popular
          </Button>
          <Button
            size="xs"
            variant={quickFilter === 'verified' ? 'solid' : 'outline'}
            colorScheme={quickFilter === 'verified' ? 'blue' : 'gray'}
            leftIcon={<Icon as={MdVerified} />}
            onClick={() => setQuickFilter(quickFilter === 'verified' ? null : 'verified')}
          >
            Verified
          </Button>
          <Button
            size="xs"
            variant={quickFilter === 'favorites' ? 'solid' : 'outline'}
            colorScheme={quickFilter === 'favorites' ? 'red' : 'gray'}
            leftIcon={<Icon as={MdFavorite} />}
            onClick={() => setQuickFilter(quickFilter === 'favorites' ? null : 'favorites')}
          >
            My Favorites
          </Button>
          {quickFilter && (
            <Button
              size="xs"
              variant="ghost"
              leftIcon={<Icon as={MdClose} />}
              onClick={() => setQuickFilter(null)}
            >
              Clear
            </Button>
          )}
        </Flex>
      </Card>

      {/* Featured & Popular Showcase - only shown when no filters active */}
      {showShowcase && (
        <>
          {/* Featured Prompts */}
          {featuredPrompts.length > 0 && (
            <Box mb="24px">
              <Flex align="center" mb="12px">
                <Icon as={MdStar} color="yellow.500" boxSize="20px" mr="8px" />
                <Text fontWeight="600" color={textColor}>Featured Prompts</Text>
                <Badge ml="8px" colorScheme="yellow" variant="subtle">
                  {featuredPrompts.length}
                </Badge>
              </Flex>
              <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing="16px">
                {featuredPrompts.slice(0, 3).map((prompt) => (
                  <PromptCard
                    key={prompt.id}
                    prompt={prompt}
                    textColor={textColor}
                    cardBg={cardBg}
                    borderColor={borderColor}
                    onView={handleViewPrompt}
                    onFork={handleFork}
                    onToggleFavorite={handleToggleFavorite}
                    isForking={forking}
                  />
                ))}
              </SimpleGrid>
              {featuredPrompts.length > 3 && (
                <Flex justify="center" mt="12px">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setQuickFilter('featured')}
                  >
                    View all {featuredPrompts.length} featured prompts
                  </Button>
                </Flex>
              )}
            </Box>
          )}

          {/* Popular Prompts */}
          {popularPrompts.length > 0 && (
            <Box mb="24px">
              <Flex align="center" mb="12px">
                <Icon as={MdTrendingUp} color="orange.500" boxSize="20px" mr="8px" />
                <Text fontWeight="600" color={textColor}>Popular Prompts</Text>
                <Badge ml="8px" colorScheme="orange" variant="subtle">
                  Top {popularPrompts.length}
                </Badge>
              </Flex>
              <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing="16px">
                {popularPrompts.slice(0, 3).map((prompt) => (
                  <PromptCard
                    key={prompt.id}
                    prompt={prompt}
                    textColor={textColor}
                    cardBg={cardBg}
                    borderColor={borderColor}
                    onView={handleViewPrompt}
                    onFork={handleFork}
                    onToggleFavorite={handleToggleFavorite}
                    isForking={forking}
                  />
                ))}
              </SimpleGrid>
              {popularPrompts.length > 3 && (
                <Flex justify="center" mt="12px">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setQuickFilter('popular')}
                  >
                    View all popular prompts
                  </Button>
                </Flex>
              )}
            </Box>
          )}

          {(featuredPrompts.length > 0 || popularPrompts.length > 0) && (
            <Divider mb="24px" />
          )}

          <Flex align="center" mb="16px">
            <Icon as={MdList} color={textColor} boxSize="20px" mr="8px" />
            <Text fontWeight="600" color={textColor}>All Prompts</Text>
            <Badge ml="8px" variant="subtle">
              {prompts.length}
            </Badge>
          </Flex>
        </>
      )}

      {/* Prompts Grid */}
      {error ? (
        <Card p="40px" bg={cardBg} textAlign="center">
          <VStack spacing="16px">
            <Icon as={MdCode} boxSize="48px" color="brand.400" />
            <Text fontWeight="600" color={textColor}>Prompt Library</Text>
            <Text color="gray.500" maxW="400px">
              No prompts available yet. Create your first prompt or check back later as the library is being populated.
            </Text>
            <Button variant="brand" leftIcon={<Icon as={MdAdd} />} onClick={() => setActiveTabIndex(1)}>
              Create Your First Prompt
            </Button>
          </VStack>
        </Card>
      ) : prompts.length === 0 ? (
        <Card p="40px" bg={cardBg} textAlign="center">
          <VStack spacing="16px">
            <Icon as={MdCode} boxSize="48px" color="gray.400" />
            <Text color="gray.500">No prompts found matching your filters</Text>
            <Button
              variant="outline"
              onClick={() => {
                setSearch('');
                setTypeFilter('');
                setCategoryFilter('');
                setProviderFilter('');
                setQuickFilter(null);
              }}
            >
              Clear Filters
            </Button>
          </VStack>
        </Card>
      ) : (
        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing="20px">
          {prompts.map((prompt) => (
            <PromptCard
              key={prompt.id}
              prompt={prompt}
              textColor={textColor}
              cardBg={cardBg}
              borderColor={borderColor}
              onView={handleViewPrompt}
              onFork={handleFork}
              onToggleFavorite={handleToggleFavorite}
              isForking={forking}
            />
          ))}
        </SimpleGrid>
      )}

      {/* Detail Modal */}
      <PromptDetailModal
        prompt={selectedPrompt}
        isOpen={isOpen}
        onClose={onClose}
        textColor={textColor}
      />

          </TabPanel>
          <TabPanel px="0">
            <PromptGenerator onSaved={() => refetch()} />
          </TabPanel>
          <TabPanel px="0">
            <PromptReconciler />
          </TabPanel>
          <TabPanel px="0">
            <PolicyOverheadDashboard />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Box>
  );
}
