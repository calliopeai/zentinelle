'use client';

import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Icon,
  Button,
  Input,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  IconButton,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Select,
  Textarea,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
  useToast,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Tag,
  TagLabel,
  TagCloseButton,
  Tooltip,
  Divider,
  useColorModeValue,
} from '@chakra-ui/react';
import { useState, useMemo } from 'react';
import {
  MdSearch,
  MdAdd,
  MdDelete,
  MdUpload,
  MdDownload,
  MdBlock,
  MdCheckCircle,
  MdPublic,
  MdBusiness,
  MdWarning,
  MdContentCopy,
  MdFilterList,
} from 'react-icons/md';

interface Domain {
  id: string;
  domain: string;
  category: string;
  listType: 'blocked' | 'allowed';
  source: 'manual' | 'import' | 'external';
  notes?: string;
  addedAt: string;
}

interface BlockedDomainManagerProps {
  blockedDomains: string[];
  allowedDomains: string[];
  onChange: (blocked: string[], allowed: string[]) => void;
  readOnly?: boolean;
}

const DOMAIN_CATEGORIES = [
  { value: 'competitor', label: 'Competitor', color: 'red' },
  { value: 'malicious', label: 'Malicious/Phishing', color: 'red' },
  { value: 'social', label: 'Social Media', color: 'blue' },
  { value: 'entertainment', label: 'Entertainment', color: 'purple' },
  { value: 'ai_provider', label: 'AI Provider', color: 'green' },
  { value: 'cloud', label: 'Cloud Service', color: 'cyan' },
  { value: 'internal', label: 'Internal/Corporate', color: 'orange' },
  { value: 'other', label: 'Other', color: 'gray' },
];

// Common pre-built blocklists
const PRESET_BLOCKLISTS = {
  competitors: ['competitor1.com', 'competitor2.com'],
  social_media: ['facebook.com', 'twitter.com', 'instagram.com', 'tiktok.com', 'linkedin.com'],
  entertainment: ['youtube.com', 'netflix.com', 'twitch.tv', 'reddit.com'],
  ai_providers: ['openai.com', 'anthropic.com', 'google.com/ai', 'huggingface.co'],
};

// Common pre-built allowlists
const PRESET_ALLOWLISTS = {
  ai_apis: ['api.openai.com', 'api.anthropic.com', 'generativelanguage.googleapis.com'],
  cloud_storage: ['s3.amazonaws.com', 'storage.googleapis.com', 'blob.core.windows.net'],
  common_apis: ['api.github.com', 'api.slack.com', 'hooks.slack.com'],
};

function isValidDomain(domain: string): boolean {
  // Basic domain validation
  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
  // Also allow wildcards like *.example.com
  const wildcardRegex = /^\*\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
  return domainRegex.test(domain) || wildcardRegex.test(domain);
}

function normalizeDomain(domain: string): string {
  // Remove protocol, path, and trailing slashes
  let normalized = domain.toLowerCase().trim();
  normalized = normalized.replace(/^https?:\/\//, '');
  normalized = normalized.replace(/\/.*$/, '');
  normalized = normalized.replace(/^www\./, '');
  return normalized;
}

export default function BlockedDomainManager({
  blockedDomains,
  allowedDomains,
  onChange,
  readOnly = false,
}: BlockedDomainManagerProps) {
  const cardBg = useColorModeValue('white', 'navy.800');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.200');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const hoverBg = useColorModeValue('gray.50', 'whiteAlpha.100');
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [newCategory, setNewCategory] = useState('other');
  const [bulkInput, setBulkInput] = useState('');
  const [activeTab, setActiveTab] = useState(0); // 0 = blocked, 1 = allowed

  const { isOpen: isImportOpen, onOpen: onImportOpen, onClose: onImportClose } = useDisclosure();
  const { isOpen: isPresetOpen, onOpen: onPresetOpen, onClose: onPresetClose } = useDisclosure();

  // Convert string arrays to Domain objects for display
  const blockedDomainObjects: Domain[] = useMemo(() => {
    return blockedDomains.map((d, i) => ({
      id: `blocked-${i}`,
      domain: d,
      category: 'other',
      listType: 'blocked' as const,
      source: 'manual' as const,
      addedAt: new Date().toISOString(),
    }));
  }, [blockedDomains]);

  const allowedDomainObjects: Domain[] = useMemo(() => {
    return allowedDomains.map((d, i) => ({
      id: `allowed-${i}`,
      domain: d,
      category: 'other',
      listType: 'allowed' as const,
      source: 'manual' as const,
      addedAt: new Date().toISOString(),
    }));
  }, [allowedDomains]);

  const currentList = activeTab === 0 ? blockedDomainObjects : allowedDomainObjects;
  const currentDomains = activeTab === 0 ? blockedDomains : allowedDomains;

  // Filter domains
  const filteredDomains = useMemo(() => {
    return currentList.filter((d) => {
      if (search && !d.domain.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      if (categoryFilter && d.category !== categoryFilter) {
        return false;
      }
      return true;
    });
  }, [currentList, search, categoryFilter]);

  const handleAddDomain = () => {
    if (!newDomain.trim()) return;

    const normalized = normalizeDomain(newDomain);
    if (!isValidDomain(normalized)) {
      toast({
        title: 'Invalid domain',
        description: 'Please enter a valid domain (e.g., example.com or *.example.com)',
        status: 'error',
        duration: 3000,
      });
      return;
    }

    if (currentDomains.includes(normalized)) {
      toast({
        title: 'Domain already exists',
        description: `${normalized} is already in the ${activeTab === 0 ? 'blocked' : 'allowed'} list`,
        status: 'warning',
        duration: 3000,
      });
      return;
    }

    if (activeTab === 0) {
      onChange([...blockedDomains, normalized], allowedDomains);
    } else {
      onChange(blockedDomains, [...allowedDomains, normalized]);
    }

    setNewDomain('');
    toast({
      title: 'Domain added',
      status: 'success',
      duration: 2000,
    });
  };

  const handleRemoveDomain = (domain: string) => {
    if (activeTab === 0) {
      onChange(blockedDomains.filter((d) => d !== domain), allowedDomains);
    } else {
      onChange(blockedDomains, allowedDomains.filter((d) => d !== domain));
    }
  };

  const handleBulkImport = () => {
    const lines = bulkInput
      .split(/[\n,]/)
      .map((l) => normalizeDomain(l))
      .filter((l) => l && isValidDomain(l));

    if (lines.length === 0) {
      toast({
        title: 'No valid domains found',
        status: 'warning',
        duration: 3000,
      });
      return;
    }

    const newDomains = lines.filter((d) => !currentDomains.includes(d));
    const duplicates = lines.length - newDomains.length;

    if (activeTab === 0) {
      onChange([...blockedDomains, ...newDomains], allowedDomains);
    } else {
      onChange(blockedDomains, [...allowedDomains, ...newDomains]);
    }

    toast({
      title: `Imported ${newDomains.length} domains`,
      description: duplicates > 0 ? `${duplicates} duplicates skipped` : undefined,
      status: 'success',
      duration: 3000,
    });

    setBulkInput('');
    onImportClose();
  };

  const handlePresetAdd = (preset: string[]) => {
    const newDomains = preset.filter((d) => !currentDomains.includes(d));

    if (activeTab === 0) {
      onChange([...blockedDomains, ...newDomains], allowedDomains);
    } else {
      onChange(blockedDomains, [...allowedDomains, ...newDomains]);
    }

    toast({
      title: `Added ${newDomains.length} domains from preset`,
      status: 'success',
      duration: 2000,
    });
    onPresetClose();
  };

  const handleExport = () => {
    const content = currentDomains.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTab === 0 ? 'blocked' : 'allowed'}-domains.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyAll = () => {
    navigator.clipboard.writeText(currentDomains.join('\n'));
    toast({
      title: 'Copied to clipboard',
      status: 'success',
      duration: 2000,
    });
  };

  return (
    <Box>
      {/* Tabs */}
      <Tabs
        index={activeTab}
        onChange={setActiveTab}
        variant="enclosed"
        colorScheme="brand"
        mb="16px"
      >
        <TabList>
          <Tab>
            <Icon as={MdBlock} mr="8px" color="red.500" />
            Blocked Domains
            <Badge ml="8px" colorScheme="red">
              {blockedDomains.length}
            </Badge>
          </Tab>
          <Tab>
            <Icon as={MdCheckCircle} mr="8px" color="green.500" />
            Allowed Domains
            <Badge ml="8px" colorScheme="green">
              {allowedDomains.length}
            </Badge>
          </Tab>
        </TabList>

        <TabPanels>
          {[0, 1].map((tabIndex) => (
            <TabPanel key={tabIndex} p="0" pt="16px">
              {/* Actions Bar */}
              {!readOnly && (
                <HStack spacing="12px" mb="16px" flexWrap="wrap">
                  <InputGroup maxW="400px">
                    <Input
                      placeholder="Add domain (e.g., example.com)"
                      value={newDomain}
                      onChange={(e) => setNewDomain(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleAddDomain()}
                    />
                    <InputRightElement w="auto" pr="4px">
                      <Button size="sm" colorScheme="brand" onClick={handleAddDomain}>
                        <Icon as={MdAdd} />
                      </Button>
                    </InputRightElement>
                  </InputGroup>
                  <Button
                    size="sm"
                    variant="outline"
                    leftIcon={<MdUpload />}
                    onClick={onImportOpen}
                  >
                    Bulk Import
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    leftIcon={<MdFilterList />}
                    onClick={onPresetOpen}
                  >
                    Add Preset
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    leftIcon={<MdDownload />}
                    onClick={handleExport}
                    isDisabled={currentDomains.length === 0}
                  >
                    Export
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    leftIcon={<MdContentCopy />}
                    onClick={handleCopyAll}
                    isDisabled={currentDomains.length === 0}
                  >
                    Copy All
                  </Button>
                </HStack>
              )}

              {/* Search/Filter */}
              <HStack spacing="12px" mb="16px">
                <InputGroup maxW="300px">
                  <InputLeftElement>
                    <Icon as={MdSearch} color="gray.400" />
                  </InputLeftElement>
                  <Input
                    placeholder="Search domains..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    size="sm"
                  />
                </InputGroup>
              </HStack>

              {/* Domain List */}
              {filteredDomains.length === 0 ? (
                <Box
                  p="40px"
                  bg={cardBg}
                  borderRadius="lg"
                  border="1px solid"
                  borderColor={borderColor}
                  textAlign="center"
                >
                  <Icon
                    as={activeTab === 0 ? MdBlock : MdCheckCircle}
                    boxSize="48px"
                    color="gray.400"
                    mb="16px"
                  />
                  <Text color="gray.500">
                    {currentDomains.length === 0
                      ? `No ${activeTab === 0 ? 'blocked' : 'allowed'} domains configured`
                      : 'No domains match your search'}
                  </Text>
                  {!readOnly && currentDomains.length === 0 && (
                    <Button
                      mt="16px"
                      size="sm"
                      variant="outline"
                      leftIcon={<MdFilterList />}
                      onClick={onPresetOpen}
                    >
                      Add from Preset
                    </Button>
                  )}
                </Box>
              ) : (
                <Box
                  bg={cardBg}
                  borderRadius="lg"
                  border="1px solid"
                  borderColor={borderColor}
                  overflow="hidden"
                >
                  <Table size="sm">
                    <Thead>
                      <Tr>
                        <Th borderColor={borderColor}>Domain</Th>
                        <Th borderColor={borderColor} w="100px">
                          Actions
                        </Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {filteredDomains.map((domain) => (
                        <Tr key={domain.id} _hover={{ bg: hoverBg }}>
                          <Td borderColor={borderColor}>
                            <HStack spacing="8px">
                              <Icon
                                as={domain.domain.startsWith('*.') ? MdPublic : MdBusiness}
                                color="gray.400"
                              />
                              <Text fontFamily="mono" fontSize="sm">
                                {domain.domain}
                              </Text>
                              {domain.domain.startsWith('*.') && (
                                <Tooltip label="Wildcard - matches all subdomains">
                                  <Badge colorScheme="purple" fontSize="9px">
                                    wildcard
                                  </Badge>
                                </Tooltip>
                              )}
                            </HStack>
                          </Td>
                          <Td borderColor={borderColor}>
                            {!readOnly && (
                              <IconButton
                                aria-label="Remove"
                                icon={<MdDelete />}
                                size="sm"
                                variant="ghost"
                                colorScheme="red"
                                onClick={() => handleRemoveDomain(domain.domain)}
                              />
                            )}
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </Box>
              )}

              {/* Summary */}
              <Text fontSize="xs" color="gray.500" mt="12px">
                {filteredDomains.length} of {currentDomains.length} domains shown
                {activeTab === 0
                  ? ' • Agents will be blocked from accessing these domains'
                  : ' • Only these domains will be accessible (when block_public_internet is enabled)'}
              </Text>
            </TabPanel>
          ))}
        </TabPanels>
      </Tabs>

      {/* Bulk Import Modal */}
      <Modal isOpen={isImportOpen} onClose={onImportClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Bulk Import Domains</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text fontSize="sm" color="gray.500" mb="12px">
              Enter domains separated by commas or new lines:
            </Text>
            <Textarea
              placeholder="example.com&#10;another.com&#10;*.wildcard.com"
              value={bulkInput}
              onChange={(e) => setBulkInput(e.target.value)}
              rows={10}
              fontFamily="mono"
              fontSize="sm"
            />
            <Text fontSize="xs" color="gray.400" mt="8px">
              Tip: Use *.domain.com for wildcard matching of all subdomains
            </Text>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr="12px" onClick={onImportClose}>
              Cancel
            </Button>
            <Button colorScheme="brand" onClick={handleBulkImport}>
              Import
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Preset Modal */}
      <Modal isOpen={isPresetOpen} onClose={onPresetClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Add Preset {activeTab === 0 ? 'Blocklist' : 'Allowlist'}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing="12px" align="stretch">
              {activeTab === 0 ? (
                <>
                  <Box
                    p="12px"
                    border="1px solid"
                    borderColor={borderColor}
                    borderRadius="md"
                    cursor="pointer"
                    _hover={{ bg: hoverBg }}
                    onClick={() => handlePresetAdd(PRESET_BLOCKLISTS.social_media)}
                  >
                    <HStack justify="space-between">
                      <VStack align="start" spacing="2px">
                        <Text fontWeight="500">Social Media</Text>
                        <Text fontSize="xs" color="gray.500">
                          Facebook, Twitter, Instagram, TikTok, LinkedIn
                        </Text>
                      </VStack>
                      <Badge>{PRESET_BLOCKLISTS.social_media.length}</Badge>
                    </HStack>
                  </Box>
                  <Box
                    p="12px"
                    border="1px solid"
                    borderColor={borderColor}
                    borderRadius="md"
                    cursor="pointer"
                    _hover={{ bg: hoverBg }}
                    onClick={() => handlePresetAdd(PRESET_BLOCKLISTS.entertainment)}
                  >
                    <HStack justify="space-between">
                      <VStack align="start" spacing="2px">
                        <Text fontWeight="500">Entertainment</Text>
                        <Text fontSize="xs" color="gray.500">
                          YouTube, Netflix, Twitch, Reddit
                        </Text>
                      </VStack>
                      <Badge>{PRESET_BLOCKLISTS.entertainment.length}</Badge>
                    </HStack>
                  </Box>
                </>
              ) : (
                <>
                  <Box
                    p="12px"
                    border="1px solid"
                    borderColor={borderColor}
                    borderRadius="md"
                    cursor="pointer"
                    _hover={{ bg: hoverBg }}
                    onClick={() => handlePresetAdd(PRESET_ALLOWLISTS.ai_apis)}
                  >
                    <HStack justify="space-between">
                      <VStack align="start" spacing="2px">
                        <Text fontWeight="500">AI Provider APIs</Text>
                        <Text fontSize="xs" color="gray.500">
                          OpenAI, Anthropic, Google AI
                        </Text>
                      </VStack>
                      <Badge>{PRESET_ALLOWLISTS.ai_apis.length}</Badge>
                    </HStack>
                  </Box>
                  <Box
                    p="12px"
                    border="1px solid"
                    borderColor={borderColor}
                    borderRadius="md"
                    cursor="pointer"
                    _hover={{ bg: hoverBg }}
                    onClick={() => handlePresetAdd(PRESET_ALLOWLISTS.cloud_storage)}
                  >
                    <HStack justify="space-between">
                      <VStack align="start" spacing="2px">
                        <Text fontWeight="500">Cloud Storage</Text>
                        <Text fontSize="xs" color="gray.500">
                          AWS S3, Google Cloud Storage, Azure Blob
                        </Text>
                      </VStack>
                      <Badge>{PRESET_ALLOWLISTS.cloud_storage.length}</Badge>
                    </HStack>
                  </Box>
                  <Box
                    p="12px"
                    border="1px solid"
                    borderColor={borderColor}
                    borderRadius="md"
                    cursor="pointer"
                    _hover={{ bg: hoverBg }}
                    onClick={() => handlePresetAdd(PRESET_ALLOWLISTS.common_apis)}
                  >
                    <HStack justify="space-between">
                      <VStack align="start" spacing="2px">
                        <Text fontWeight="500">Common APIs</Text>
                        <Text fontSize="xs" color="gray.500">
                          GitHub, Slack
                        </Text>
                      </VStack>
                      <Badge>{PRESET_ALLOWLISTS.common_apis.length}</Badge>
                    </HStack>
                  </Box>
                </>
              )}
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={onPresetClose}>
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
