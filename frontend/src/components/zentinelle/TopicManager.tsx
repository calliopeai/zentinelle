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
  SimpleGrid,
  Select,
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
  Wrap,
  WrapItem,
  Tooltip,
  Switch,
  FormControl,
  FormLabel,
  Textarea,
  useColorModeValue,
} from '@chakra-ui/react';
import { useState, useMemo } from 'react';
import {
  MdSearch,
  MdAdd,
  MdDelete,
  MdBlock,
  MdCheckCircle,
  MdCategory,
  MdLabel,
  MdAutoAwesome,
  MdFilterList,
  MdWork,
  MdPerson,
} from 'react-icons/md';

interface TopicManagerProps {
  allowedTopics: string[];
  blockedTopics: string[];
  workKeywords: string[];
  personalKeywords: string[];
  useMLClassification: boolean;
  onChange: (config: {
    allowedTopics: string[];
    blockedTopics: string[];
    workKeywords: string[];
    personalKeywords: string[];
    useMLClassification: boolean;
  }) => void;
  readOnly?: boolean;
}

// Pre-built topic categories
const TOPIC_CATEGORIES = {
  business: {
    label: 'Business & Work',
    color: 'blue',
    topics: ['business', 'work', 'professional', 'corporate', 'enterprise', 'strategy', 'management'],
  },
  technology: {
    label: 'Technology',
    color: 'cyan',
    topics: ['technology', 'software', 'programming', 'development', 'engineering', 'IT', 'data'],
  },
  finance: {
    label: 'Finance',
    color: 'green',
    topics: ['finance', 'accounting', 'investment', 'banking', 'budget', 'revenue', 'costs'],
  },
  marketing: {
    label: 'Marketing',
    color: 'purple',
    topics: ['marketing', 'advertising', 'branding', 'sales', 'campaigns', 'content'],
  },
  hr: {
    label: 'HR & People',
    color: 'orange',
    topics: ['hr', 'hiring', 'recruitment', 'employees', 'benefits', 'training', 'onboarding'],
  },
  legal: {
    label: 'Legal & Compliance',
    color: 'red',
    topics: ['legal', 'compliance', 'contracts', 'regulations', 'policy', 'governance'],
  },
  personal: {
    label: 'Personal',
    color: 'pink',
    topics: ['personal', 'entertainment', 'hobbies', 'vacation', 'family', 'health', 'shopping'],
  },
  inappropriate: {
    label: 'Inappropriate',
    color: 'red',
    topics: ['adult', 'gambling', 'violence', 'hate', 'illegal', 'harassment'],
  },
};

// Pre-built keyword sets
const KEYWORD_PRESETS = {
  work: ['project', 'deadline', 'meeting', 'client', 'customer', 'report', 'presentation', 'team', 'task', 'milestone'],
  personal: ['vacation', 'hobby', 'personal', 'family', 'friend', 'weekend', 'movie', 'game', 'recipe', 'travel'],
};

export default function TopicManager({
  allowedTopics,
  blockedTopics,
  workKeywords,
  personalKeywords,
  useMLClassification,
  onChange,
  readOnly = false,
}: TopicManagerProps) {
  const cardBg = useColorModeValue('white', 'navy.800');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.200');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const hoverBg = useColorModeValue('gray.50', 'whiteAlpha.100');
  const toast = useToast();

  const [activeTab, setActiveTab] = useState(0);
  const [newItem, setNewItem] = useState('');
  const [search, setSearch] = useState('');

  const { isOpen: isPresetOpen, onOpen: onPresetOpen, onClose: onPresetClose } = useDisclosure();

  const handleAdd = (type: 'allowed' | 'blocked' | 'work' | 'personal') => {
    if (!newItem.trim()) return;

    const item = newItem.trim().toLowerCase();
    let updated = false;

    switch (type) {
      case 'allowed':
        if (!allowedTopics.includes(item)) {
          onChange({
            allowedTopics: [...allowedTopics, item],
            blockedTopics,
            workKeywords,
            personalKeywords,
            useMLClassification,
          });
          updated = true;
        }
        break;
      case 'blocked':
        if (!blockedTopics.includes(item)) {
          onChange({
            allowedTopics,
            blockedTopics: [...blockedTopics, item],
            workKeywords,
            personalKeywords,
            useMLClassification,
          });
          updated = true;
        }
        break;
      case 'work':
        if (!workKeywords.includes(item)) {
          onChange({
            allowedTopics,
            blockedTopics,
            workKeywords: [...workKeywords, item],
            personalKeywords,
            useMLClassification,
          });
          updated = true;
        }
        break;
      case 'personal':
        if (!personalKeywords.includes(item)) {
          onChange({
            allowedTopics,
            blockedTopics,
            workKeywords,
            personalKeywords: [...personalKeywords, item],
            useMLClassification,
          });
          updated = true;
        }
        break;
    }

    if (updated) {
      setNewItem('');
      toast({ title: 'Added', status: 'success', duration: 1500 });
    } else {
      toast({ title: 'Already exists', status: 'warning', duration: 2000 });
    }
  };

  const handleRemove = (type: 'allowed' | 'blocked' | 'work' | 'personal', item: string) => {
    switch (type) {
      case 'allowed':
        onChange({
          allowedTopics: allowedTopics.filter((t) => t !== item),
          blockedTopics,
          workKeywords,
          personalKeywords,
          useMLClassification,
        });
        break;
      case 'blocked':
        onChange({
          allowedTopics,
          blockedTopics: blockedTopics.filter((t) => t !== item),
          workKeywords,
          personalKeywords,
          useMLClassification,
        });
        break;
      case 'work':
        onChange({
          allowedTopics,
          blockedTopics,
          workKeywords: workKeywords.filter((k) => k !== item),
          personalKeywords,
          useMLClassification,
        });
        break;
      case 'personal':
        onChange({
          allowedTopics,
          blockedTopics,
          workKeywords,
          personalKeywords: personalKeywords.filter((k) => k !== item),
          useMLClassification,
        });
        break;
    }
  };

  const handlePresetAdd = (
    type: 'allowed' | 'blocked' | 'work' | 'personal',
    items: string[]
  ) => {
    const currentList =
      type === 'allowed'
        ? allowedTopics
        : type === 'blocked'
        ? blockedTopics
        : type === 'work'
        ? workKeywords
        : personalKeywords;

    const newItems = items.filter((i) => !currentList.includes(i.toLowerCase()));

    if (newItems.length === 0) {
      toast({ title: 'All items already exist', status: 'info', duration: 2000 });
      return;
    }

    switch (type) {
      case 'allowed':
        onChange({
          allowedTopics: [...allowedTopics, ...newItems],
          blockedTopics,
          workKeywords,
          personalKeywords,
          useMLClassification,
        });
        break;
      case 'blocked':
        onChange({
          allowedTopics,
          blockedTopics: [...blockedTopics, ...newItems],
          workKeywords,
          personalKeywords,
          useMLClassification,
        });
        break;
      case 'work':
        onChange({
          allowedTopics,
          blockedTopics,
          workKeywords: [...workKeywords, ...newItems],
          personalKeywords,
          useMLClassification,
        });
        break;
      case 'personal':
        onChange({
          allowedTopics,
          blockedTopics,
          workKeywords,
          personalKeywords: [...personalKeywords, ...newItems],
          useMLClassification,
        });
        break;
    }

    toast({
      title: `Added ${newItems.length} items`,
      status: 'success',
      duration: 2000,
    });
    onPresetClose();
  };

  const handleMLToggle = (enabled: boolean) => {
    onChange({
      allowedTopics,
      blockedTopics,
      workKeywords,
      personalKeywords,
      useMLClassification: enabled,
    });
  };

  const renderTagList = (
    items: string[],
    type: 'allowed' | 'blocked' | 'work' | 'personal',
    colorScheme: string
  ) => {
    const filtered = search
      ? items.filter((i) => i.toLowerCase().includes(search.toLowerCase()))
      : items;

    if (filtered.length === 0) {
      return (
        <Text fontSize="sm" color="gray.500" py="20px" textAlign="center">
          {items.length === 0 ? 'No items configured' : 'No items match your search'}
        </Text>
      );
    }

    return (
      <Wrap spacing="8px">
        {filtered.map((item) => (
          <WrapItem key={item}>
            <Tag size="md" colorScheme={colorScheme} borderRadius="full">
              <TagLabel>{item}</TagLabel>
              {!readOnly && (
                <TagCloseButton onClick={() => handleRemove(type, item)} />
              )}
            </Tag>
          </WrapItem>
        ))}
      </Wrap>
    );
  };

  return (
    <Box>
      {/* ML Classification Toggle */}
      <Box
        p="16px"
        bg={cardBg}
        borderRadius="lg"
        border="1px solid"
        borderColor={borderColor}
        mb="16px"
      >
        <HStack justify="space-between">
          <HStack spacing="12px">
            <Icon as={MdAutoAwesome} color="brand.500" boxSize="24px" />
            <VStack align="start" spacing="0">
              <Text fontWeight="600" color={textColor}>
                ML-Powered Classification
              </Text>
              <Text fontSize="xs" color="gray.500">
                Use machine learning to classify content topics automatically
              </Text>
            </VStack>
          </HStack>
          <Switch
            isChecked={useMLClassification}
            onChange={(e) => handleMLToggle(e.target.checked)}
            colorScheme="brand"
            isDisabled={readOnly}
          />
        </HStack>
      </Box>

      {/* Tabs */}
      <Tabs
        index={activeTab}
        onChange={setActiveTab}
        variant="enclosed"
        colorScheme="brand"
      >
        <TabList>
          <Tab>
            <Icon as={MdCheckCircle} mr="8px" color="green.500" />
            Allowed Topics
            <Badge ml="8px" colorScheme="green">
              {allowedTopics.length}
            </Badge>
          </Tab>
          <Tab>
            <Icon as={MdBlock} mr="8px" color="red.500" />
            Blocked Topics
            <Badge ml="8px" colorScheme="red">
              {blockedTopics.length}
            </Badge>
          </Tab>
          <Tab>
            <Icon as={MdWork} mr="8px" color="blue.500" />
            Work Keywords
            <Badge ml="8px" colorScheme="blue">
              {workKeywords.length}
            </Badge>
          </Tab>
          <Tab>
            <Icon as={MdPerson} mr="8px" color="purple.500" />
            Personal Keywords
            <Badge ml="8px" colorScheme="purple">
              {personalKeywords.length}
            </Badge>
          </Tab>
        </TabList>

        <TabPanels>
          {/* Allowed Topics */}
          <TabPanel px="0">
            <Text fontSize="sm" color="gray.500" mb="12px">
              Content related to these topics will be allowed through
            </Text>
            {!readOnly && (
              <HStack spacing="12px" mb="16px">
                <InputGroup maxW="300px">
                  <Input
                    placeholder="Add topic..."
                    value={newItem}
                    onChange={(e) => setNewItem(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAdd('allowed')}
                  />
                  <InputRightElement w="auto" pr="4px">
                    <Button size="sm" colorScheme="green" onClick={() => handleAdd('allowed')}>
                      <Icon as={MdAdd} />
                    </Button>
                  </InputRightElement>
                </InputGroup>
                <Button size="sm" variant="outline" leftIcon={<MdFilterList />} onClick={onPresetOpen}>
                  Add Category
                </Button>
              </HStack>
            )}
            <InputGroup maxW="250px" mb="12px">
              <InputLeftElement>
                <Icon as={MdSearch} color="gray.400" />
              </InputLeftElement>
              <Input
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                size="sm"
              />
            </InputGroup>
            <Box
              p="16px"
              bg={cardBg}
              borderRadius="lg"
              border="1px solid"
              borderColor={borderColor}
            >
              {renderTagList(allowedTopics, 'allowed', 'green')}
            </Box>
          </TabPanel>

          {/* Blocked Topics */}
          <TabPanel px="0">
            <Text fontSize="sm" color="gray.500" mb="12px">
              Content related to these topics will be blocked or flagged
            </Text>
            {!readOnly && (
              <HStack spacing="12px" mb="16px">
                <InputGroup maxW="300px">
                  <Input
                    placeholder="Add topic..."
                    value={newItem}
                    onChange={(e) => setNewItem(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAdd('blocked')}
                  />
                  <InputRightElement w="auto" pr="4px">
                    <Button size="sm" colorScheme="red" onClick={() => handleAdd('blocked')}>
                      <Icon as={MdAdd} />
                    </Button>
                  </InputRightElement>
                </InputGroup>
                <Button size="sm" variant="outline" leftIcon={<MdFilterList />} onClick={onPresetOpen}>
                  Add Category
                </Button>
              </HStack>
            )}
            <InputGroup maxW="250px" mb="12px">
              <InputLeftElement>
                <Icon as={MdSearch} color="gray.400" />
              </InputLeftElement>
              <Input
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                size="sm"
              />
            </InputGroup>
            <Box
              p="16px"
              bg={cardBg}
              borderRadius="lg"
              border="1px solid"
              borderColor={borderColor}
            >
              {renderTagList(blockedTopics, 'blocked', 'red')}
            </Box>
          </TabPanel>

          {/* Work Keywords */}
          <TabPanel px="0">
            <Text fontSize="sm" color="gray.500" mb="12px">
              Keywords indicating work-related content (used for classification)
            </Text>
            {!readOnly && (
              <HStack spacing="12px" mb="16px">
                <InputGroup maxW="300px">
                  <Input
                    placeholder="Add keyword..."
                    value={newItem}
                    onChange={(e) => setNewItem(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAdd('work')}
                  />
                  <InputRightElement w="auto" pr="4px">
                    <Button size="sm" colorScheme="blue" onClick={() => handleAdd('work')}>
                      <Icon as={MdAdd} />
                    </Button>
                  </InputRightElement>
                </InputGroup>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handlePresetAdd('work', KEYWORD_PRESETS.work)}
                >
                  Add Common Work Keywords
                </Button>
              </HStack>
            )}
            <InputGroup maxW="250px" mb="12px">
              <InputLeftElement>
                <Icon as={MdSearch} color="gray.400" />
              </InputLeftElement>
              <Input
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                size="sm"
              />
            </InputGroup>
            <Box
              p="16px"
              bg={cardBg}
              borderRadius="lg"
              border="1px solid"
              borderColor={borderColor}
            >
              {renderTagList(workKeywords, 'work', 'blue')}
            </Box>
          </TabPanel>

          {/* Personal Keywords */}
          <TabPanel px="0">
            <Text fontSize="sm" color="gray.500" mb="12px">
              Keywords indicating personal/non-work content (used for classification)
            </Text>
            {!readOnly && (
              <HStack spacing="12px" mb="16px">
                <InputGroup maxW="300px">
                  <Input
                    placeholder="Add keyword..."
                    value={newItem}
                    onChange={(e) => setNewItem(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAdd('personal')}
                  />
                  <InputRightElement w="auto" pr="4px">
                    <Button size="sm" colorScheme="purple" onClick={() => handleAdd('personal')}>
                      <Icon as={MdAdd} />
                    </Button>
                  </InputRightElement>
                </InputGroup>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handlePresetAdd('personal', KEYWORD_PRESETS.personal)}
                >
                  Add Common Personal Keywords
                </Button>
              </HStack>
            )}
            <InputGroup maxW="250px" mb="12px">
              <InputLeftElement>
                <Icon as={MdSearch} color="gray.400" />
              </InputLeftElement>
              <Input
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                size="sm"
              />
            </InputGroup>
            <Box
              p="16px"
              bg={cardBg}
              borderRadius="lg"
              border="1px solid"
              borderColor={borderColor}
            >
              {renderTagList(personalKeywords, 'personal', 'purple')}
            </Box>
          </TabPanel>
        </TabPanels>
      </Tabs>

      {/* Category Preset Modal */}
      <Modal isOpen={isPresetOpen} onClose={onPresetClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Add Topic Category</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <SimpleGrid columns={2} spacing="12px">
              {Object.entries(TOPIC_CATEGORIES).map(([key, category]) => (
                <Box
                  key={key}
                  p="12px"
                  border="1px solid"
                  borderColor={borderColor}
                  borderRadius="md"
                  cursor="pointer"
                  _hover={{ bg: hoverBg }}
                  onClick={() =>
                    handlePresetAdd(activeTab === 0 ? 'allowed' : 'blocked', category.topics)
                  }
                >
                  <HStack justify="space-between" mb="8px">
                    <Badge colorScheme={category.color}>{category.label}</Badge>
                    <Text fontSize="xs" color="gray.500">
                      {category.topics.length} topics
                    </Text>
                  </HStack>
                  <Text fontSize="xs" color="gray.500" noOfLines={2}>
                    {category.topics.slice(0, 5).join(', ')}
                    {category.topics.length > 5 && '...'}
                  </Text>
                </Box>
              ))}
            </SimpleGrid>
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
