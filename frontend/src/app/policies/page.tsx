'use client';

import {
  Box,
  Button,
  Flex,
  Icon,
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
  Spinner,
  Text,
  useColorModeValue,
  Badge,
  IconButton,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useToast,
  Switch,
  Tooltip,
  FormControl,
  FormLabel,
  Textarea,
  TableContainer,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
} from '@chakra-ui/react';
import { useQuery, useMutation } from '@apollo/client';
import { useState, useMemo } from 'react';
import { MdAdd, MdSearch, MdMoreVert, MdRefresh, MdDelete, MdEdit, MdAnalytics, MdList, MdPlayArrow, MdAccountTree, MdHistory } from 'react-icons/md';
import { useRouter } from 'next/navigation';
import Card from 'components/card/Card';
import PolicyAnalyzer from 'components/zentinelle/PolicyAnalyzer';
import PolicySimulator from 'components/zentinelle/PolicySimulator';
import PolicyHierarchy from 'components/zentinelle/PolicyHierarchy';
import PolicyVersioning from 'components/zentinelle/PolicyVersioning';
import { GET_POLICIES, GET_POLICY_OPTIONS, DELETE_POLICY, UPDATE_POLICY } from 'graphql/policies';
import { usePageHeader } from 'contexts/PageHeaderContext';

interface Policy {
  id: string;
  name: string;
  description: string;
  policyType: string;
  scopeType: string;
  config: string;
  priority: number;
  enforcement: string;
  enabled: boolean;
  scopeName: string;
  createdByUsername: string;
  createdAt: string;
  updatedAt: string;
}

interface PolicyTypeOption {
  value: string;
  label: string;
  description: string;
  category: string;
}

interface ScopeTypeOption {
  value: string;
  label: string;
}

interface EnforcementOption {
  value: string;
  label: string;
  description: string;
}

interface PolicyOptions {
  policyTypes: PolicyTypeOption[];
  scopeTypes: ScopeTypeOption[];
  enforcementLevels: EnforcementOption[];
}

// Color schemes for policy types by category
const POLICY_TYPE_COLORS: Record<string, string> = {
  // AI Behavior
  system_prompt: 'purple',
  ai_guardrail: 'pink',
  // LLM Controls
  model_restriction: 'blue',
  context_limit: 'cyan',
  output_filter: 'teal',
  // Agent Controls
  agent_capability: 'orange',
  agent_memory: 'yellow',
  human_oversight: 'red',
  // Resources
  resource_quota: 'green',
  budget_limit: 'green',
  rate_limit: 'blue',
  // Security
  tool_permission: 'orange',
  network_policy: 'red',
  secret_access: 'yellow',
  data_access: 'teal',
  // Compliance
  audit_policy: 'gray',
  session_policy: 'brand',
  data_retention: 'linkedin',
};

// Color schemes for enforcement levels
const ENFORCEMENT_COLORS: Record<string, string> = {
  enforce: 'red',
  audit: 'yellow',
  disabled: 'gray',
};

function getPolicyTypeColor(type: string): string {
  return POLICY_TYPE_COLORS[type?.toLowerCase()] || 'gray';
}

function getEnforcementColor(enforcement: string): string {
  return ENFORCEMENT_COLORS[enforcement?.toLowerCase()] || 'gray';
}

function formatDate(dateString: string): string {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString();
}

export default function PoliciesPage() {
  usePageHeader('Policies', 'Define and manage governance policies for AI agents');
  const router = useRouter();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [scopeFilter, setScopeFilter] = useState('');
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [selectedPolicy, setSelectedPolicy] = useState<Policy | null>(null);
  const [versioningPolicyId, setVersioningPolicyId] = useState<string>('');

  const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onClose: onDeleteClose } = useDisclosure();
  const { isOpen: isEditOpen, onOpen: onEditOpen, onClose: onEditClose } = useDisclosure();
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const cardBg = useColorModeValue('white', 'navy.800');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.100');

  // Fetch policy options from backend for filters
  const { data: optionsData } = useQuery<{ policyOptions: PolicyOptions }>(GET_POLICY_OPTIONS);
  const policyOptions = optionsData?.policyOptions;

  // Group policy types by category for filter dropdown
  const groupedPolicyTypes = useMemo(() => {
    if (!policyOptions?.policyTypes) return {};
    return policyOptions.policyTypes.reduce((acc, type) => {
      const category = type.category || 'Other';
      if (!acc[category]) acc[category] = [];
      acc[category].push(type);
      return acc;
    }, {} as Record<string, PolicyTypeOption[]>);
  }, [policyOptions?.policyTypes]);

  // Create lookup for policy type labels
  const policyTypeLabels = useMemo(() => {
    if (!policyOptions?.policyTypes) return {};
    return policyOptions.policyTypes.reduce((acc, type) => {
      acc[type.value] = type.label;
      return acc;
    }, {} as Record<string, string>);
  }, [policyOptions?.policyTypes]);

  const { data, loading, error, refetch } = useQuery(GET_POLICIES, {
    variables: {
      search: search || undefined,
      policyType: typeFilter || undefined,
      scopeType: scopeFilter || undefined,
      first: 50,
    },
    fetchPolicy: 'cache-and-network',
  });

  const [deletePolicy, { loading: deleting }] = useMutation(DELETE_POLICY, {
    onCompleted: (result) => {
      if (result.deletePolicy.success) {
        toast({ title: 'Policy deleted successfully', status: 'success' });
        refetch();
      } else {
        toast({ title: 'Failed to delete policy', description: result.deletePolicy.error, status: 'error' });
      }
      onDeleteClose();
    },
  });

  const [updatePolicy] = useMutation(UPDATE_POLICY, {
    onCompleted: (result) => {
      if (result.updatePolicy.success) {
        toast({ title: 'Policy updated', status: 'success', duration: 2000 });
        refetch();
      } else {
        toast({ title: 'Failed to update policy', description: result.updatePolicy.error, status: 'error' });
      }
    },
  });

  const policies: Policy[] = data?.policies?.edges?.map((edge: { node: Policy }) => edge.node) || [];

  const handleDelete = () => {
    if (selectedPolicy) {
      deletePolicy({ variables: { id: selectedPolicy.id } });
    }
  };

  const handleOpenEdit = (policy: Policy) => {
    setSelectedPolicy(policy);
    setEditName(policy.name);
    setEditDescription(policy.description || '');
    onEditOpen();
  };

  const handleEditSave = () => {
    if (selectedPolicy) {
      updatePolicy({
        variables: {
          input: {
            id: selectedPolicy.id,
            name: editName,
            description: editDescription,
          },
        },
      });
      onEditClose();
    }
  };

  const handleToggleEnabled = (policy: Policy) => {
    updatePolicy({
      variables: {
        input: {
          id: policy.id,
          enabled: !policy.enabled,
        },
      },
    });
  };

  return (
    <Box>
      <Flex justify="flex-end" mb="20px">
        <Flex gap="12px">
          <Button
            variant="outline"
            leftIcon={<Icon as={MdRefresh} />}
            onClick={() => refetch()}
            isLoading={loading}
          >
            Refresh
          </Button>
          <Button
            variant="brand"
            leftIcon={<Icon as={MdAdd} />}
            onClick={() => router.push('/policies/create')}
          >
            Create Policy
          </Button>
        </Flex>
      </Flex>

      {/* Tabs for List and Analyzer */}
      <Tabs variant="enclosed" colorScheme="brand" mb="24px" index={activeTabIndex} onChange={setActiveTabIndex}>
        <TabList>
          <Tab><Icon as={MdList} mr="8px" />Policy List</Tab>
          <Tab><Icon as={MdAccountTree} mr="8px" />Hierarchy</Tab>
          <Tab><Icon as={MdHistory} mr="8px" />Versions</Tab>
          <Tab><Icon as={MdAnalytics} mr="8px" />Analyzer</Tab>
          <Tab><Icon as={MdPlayArrow} mr="8px" />Simulator</Tab>
        </TabList>
        <TabPanels>
          <TabPanel px="0">

      {/* Filters */}
      <Card p="20px" mb="24px" bg={cardBg}>
        <Flex gap="16px" flexWrap="wrap">
          <InputGroup maxW="300px">
            <InputLeftElement>
              <Icon as={MdSearch} color="gray.400" />
            </InputLeftElement>
            <Input
              placeholder="Search policies..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </InputGroup>
          <Select
            placeholder="All Types"
            maxW="200px"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            {Object.entries(groupedPolicyTypes).map(([category, types]) => (
              <optgroup key={category} label={category}>
                {types.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
          <Select
            placeholder="All Scopes"
            maxW="180px"
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value)}
          >
            {policyOptions?.scopeTypes.map((scope) => (
              <option key={scope.value} value={scope.value}>
                {scope.label}
              </option>
            ))}
          </Select>
        </Flex>
      </Card>

      {/* Loading / Error States */}
      {loading && policies.length === 0 && (
        <Flex justify="center" py="40px">
          <Spinner size="xl" color="brand.500" />
        </Flex>
      )}

      {error && (
        <Card p="20px" bg={cardBg}>
          <Text color="red.500">Error loading policies: {error.message}</Text>
        </Card>
      )}

      {/* Policies Table */}
      {policies.length > 0 && (
        <Card p="0" bg={cardBg}>
          <TableContainer>
            <Table variant="simple">
              <Thead>
                <Tr>
                  <Th borderColor={borderColor} color="secondaryGray.600">Enabled</Th>
                  <Th borderColor={borderColor} color="secondaryGray.600">Name</Th>
                  <Th borderColor={borderColor} color="secondaryGray.600">Type</Th>
                  <Th borderColor={borderColor} color="secondaryGray.600">Scope</Th>
                  <Th borderColor={borderColor} color="secondaryGray.600">Enforcement</Th>
                  <Th borderColor={borderColor} color="secondaryGray.600">Priority</Th>
                  <Th borderColor={borderColor} color="secondaryGray.600">Created</Th>
                  <Th borderColor={borderColor} color="secondaryGray.600">Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {policies.map((policy) => (
                  <Tr key={policy.id}>
                    <Td borderColor={borderColor}>
                      <Switch
                        isChecked={policy.enabled}
                        onChange={() => handleToggleEnabled(policy)}
                        colorScheme="brand"
                      />
                    </Td>
                    <Td borderColor={borderColor}>
                      <Box>
                        <Text fontWeight="600" color={textColor}>
                          {policy.name}
                        </Text>
                        {policy.description && (
                          <Text fontSize="xs" color="gray.500" noOfLines={1}>
                            {policy.description}
                          </Text>
                        )}
                      </Box>
                    </Td>
                    <Td borderColor={borderColor}>
                      <Badge colorScheme={getPolicyTypeColor(policy.policyType)}>
                        {policyTypeLabels[policy.policyType] || policy.policyType}
                      </Badge>
                    </Td>
                    <Td borderColor={borderColor}>
                      <Text fontSize="sm">{policy.scopeName || policy.scopeType}</Text>
                    </Td>
                    <Td borderColor={borderColor}>
                      <Badge colorScheme={getEnforcementColor(policy.enforcement)}>
                        {policy.enforcement}
                      </Badge>
                    </Td>
                    <Td borderColor={borderColor}>
                      <Text fontSize="sm">{policy.priority}</Text>
                    </Td>
                    <Td borderColor={borderColor}>
                      <Tooltip label={policy.createdByUsername || 'System'}>
                        <Text fontSize="sm">{formatDate(policy.createdAt)}</Text>
                      </Tooltip>
                    </Td>
                    <Td borderColor={borderColor}>
                      <Menu>
                        <MenuButton
                          as={IconButton}
                          icon={<MdMoreVert />}
                          variant="ghost"
                          size="sm"
                        />
                        <MenuList>
                          <MenuItem
                            icon={<MdEdit />}
                            onClick={() => handleOpenEdit(policy)}
                          >
                            Edit Policy
                          </MenuItem>
                          <MenuItem
                            icon={<MdDelete />}
                            color="red.500"
                            onClick={() => {
                              setSelectedPolicy(policy);
                              onDeleteOpen();
                            }}
                          >
                            Delete Policy
                          </MenuItem>
                        </MenuList>
                      </Menu>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {/* Empty State */}
      {!loading && policies.length === 0 && !error && (
        <Card p="40px" bg={cardBg} textAlign="center">
          <Text fontSize="lg" color={textColor} mb="8px">
            No policies defined yet
          </Text>
          <Text color="gray.500" mb="20px">
            Create your first policy to control AI agent behavior
          </Text>
          <Button
            variant="brand"
            leftIcon={<Icon as={MdAdd} />}
            onClick={() => router.push('/policies/create')}
          >
            Create Policy
          </Button>
        </Card>
      )}

      {/* Edit Policy Modal */}
      <Modal isOpen={isEditOpen} onClose={onEditClose} size={{ base: 'full', md: 'xl' }}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Edit Policy</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <FormControl mb="16px">
              <FormLabel>Name</FormLabel>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} color={textColor} />
            </FormControl>
            <FormControl>
              <FormLabel>Description</FormLabel>
              <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={3} color={textColor} />
            </FormControl>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onEditClose}>Cancel</Button>
            <Button variant="brand" onClick={handleEditSave} isDisabled={!editName.trim()}>Save</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={isDeleteOpen} onClose={onDeleteClose} size={{ base: 'full', md: 'xl' }}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Delete Policy</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            Are you sure you want to delete <strong>{selectedPolicy?.name}</strong>? This action cannot be undone.
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onDeleteClose}>
              Cancel
            </Button>
            <Button colorScheme="red" onClick={handleDelete} isLoading={deleting}>
              Delete
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

          </TabPanel>
          <TabPanel px="0">
            <PolicyHierarchy />
          </TabPanel>
          <TabPanel px="0">
            <Card p="16px" mb="20px" bg={cardBg}>
              <Select
                placeholder="Select a policy to view its version history"
                value={versioningPolicyId}
                onChange={(e) => setVersioningPolicyId(e.target.value)}
                maxW="400px"
              >
                {policies.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </Card>
            <PolicyVersioning policyId={versioningPolicyId || undefined} />
          </TabPanel>
          <TabPanel px="0">
            <PolicyAnalyzer onOpenSimulator={() => setActiveTabIndex(4)} />
          </TabPanel>
          <TabPanel px="0">
            <PolicySimulator />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Box>
  );
}
