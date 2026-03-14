'use client';

import { useState, useMemo } from 'react';
import {
  VStack,
  HStack,
  Text,
  Icon,
  useColorModeValue,
  Button,
  IconButton,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  Spinner,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
  FormControl,
  FormLabel,
  Input,
  Textarea,
  Select,
  Switch,
  useToast,
  Flex,
  Box,
  Tag,
  TagLabel,
  TagCloseButton,
  Wrap,
  WrapItem,
  Alert,
  AlertIcon,
  InputGroup,
  InputRightElement,
  Tooltip,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
} from '@chakra-ui/react';
import {
  MdAdd,
  MdRefresh,
  MdLanguage,
  MdBlock,
  MdCheck,
  MdMoreVert,
  MdEdit,
  MdDelete,
  MdWarning,
  MdInfo,
} from 'react-icons/md';
import { useQuery, useMutation } from '@apollo/client';
import Card from 'components/card/Card';
import { GET_POLICIES, CREATE_POLICY, UPDATE_POLICY, DELETE_POLICY, TOGGLE_POLICY } from 'graphql/policies';
import { useOrganization } from 'contexts/OrganizationContext';

interface Policy {
  id: string;
  name: string;
  description: string;
  policyType: string;
  scopeType: string;
  scopeName: string;
  config: {
    allowed_outbound_domains?: string[];
    blocked_outbound_domains?: string[];
    block_public_internet?: boolean;
  };
  priority: number;
  enforcement: string;
  enabled: boolean;
  createdByUsername: string;
  createdAt: string;
  updatedAt: string;
}

interface PolicyForm {
  name: string;
  description: string;
  scopeType: string;
  allowedDomains: string[];
  blockedDomains: string[];
  blockPublicInternet: boolean;
  enforcement: string;
  priority: number;
  enabled: boolean;
}

const DEFAULT_FORM: PolicyForm = {
  name: '',
  description: '',
  scopeType: 'organization',
  allowedDomains: [],
  blockedDomains: [],
  blockPublicInternet: false,
  enforcement: 'enforce',
  priority: 0,
  enabled: true,
};

const SCOPE_OPTIONS = [
  { value: 'organization', label: 'Organization-wide' },
  { value: 'deployment', label: 'Deployment' },
  { value: 'endpoint', label: 'Endpoint' },
];

const ENFORCEMENT_OPTIONS = [
  { value: 'enforce', label: 'Enforce', description: 'Block violations' },
  { value: 'audit', label: 'Audit Only', description: 'Log but allow' },
  { value: 'disabled', label: 'Disabled', description: 'No action' },
];

export default function DomainPatternBuilder() {
  const cardBg = useColorModeValue('white', 'navy.800');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const subtleText = useColorModeValue('gray.500', 'gray.400');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.100');
  const hoverBg = useColorModeValue('gray.50', 'whiteAlpha.100');
  const toast = useToast();
  const { organization } = useOrganization();

  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [form, setForm] = useState<PolicyForm>(DEFAULT_FORM);
  const [domainInput, setDomainInput] = useState('');
  const [domainMode, setDomainMode] = useState<'allow' | 'block'>('allow');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const policyModal = useDisclosure();
  const deleteModal = useDisclosure();

  // Query for network policies
  const { data, loading, refetch } = useQuery(GET_POLICIES, {
    variables: { policyType: 'network_policy', first: 50 },
    skip: !organization?.id,
  });

  // Mutations
  const [createPolicy, { loading: creating }] = useMutation(CREATE_POLICY);
  const [updatePolicy, { loading: updating }] = useMutation(UPDATE_POLICY);
  const [deletePolicy] = useMutation(DELETE_POLICY);
  const [togglePolicy] = useMutation(TOGGLE_POLICY);

  const policies: Policy[] = useMemo(() => {
    return data?.policies?.edges?.map((e: any) => e.node) || [];
  }, [data]);

  const openCreateModal = () => {
    setEditingPolicy(null);
    setForm(DEFAULT_FORM);
    policyModal.onOpen();
  };

  const openEditModal = (policy: Policy) => {
    setEditingPolicy(policy);
    setForm({
      name: policy.name,
      description: policy.description,
      scopeType: policy.scopeType,
      allowedDomains: policy.config.allowed_outbound_domains || [],
      blockedDomains: policy.config.blocked_outbound_domains || [],
      blockPublicInternet: policy.config.block_public_internet || false,
      enforcement: policy.enforcement,
      priority: policy.priority,
      enabled: policy.enabled,
    });
    policyModal.onOpen();
  };

  const addDomain = () => {
    const domain = domainInput.trim().toLowerCase();
    if (!domain) return;

    // Basic domain validation
    if (!/^[a-z0-9*.-]+\.[a-z]{2,}$/.test(domain) && !domain.startsWith('*.')) {
      toast({ title: 'Invalid domain format', status: 'warning', duration: 3000 });
      return;
    }

    if (domainMode === 'allow') {
      if (!form.allowedDomains.includes(domain)) {
        setForm({ ...form, allowedDomains: [...form.allowedDomains, domain] });
      }
    } else {
      if (!form.blockedDomains.includes(domain)) {
        setForm({ ...form, blockedDomains: [...form.blockedDomains, domain] });
      }
    }
    setDomainInput('');
  };

  const removeDomain = (domain: string, mode: 'allow' | 'block') => {
    if (mode === 'allow') {
      setForm({ ...form, allowedDomains: form.allowedDomains.filter((d) => d !== domain) });
    } else {
      setForm({ ...form, blockedDomains: form.blockedDomains.filter((d) => d !== domain) });
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Name is required', status: 'warning', duration: 3000 });
      return;
    }

    const config = {
      allowed_outbound_domains: form.allowedDomains,
      blocked_outbound_domains: form.blockedDomains,
      block_public_internet: form.blockPublicInternet,
    };

    try {
      if (editingPolicy) {
        const result = await updatePolicy({
          variables: {
            input: {
              id: editingPolicy.id,
              name: form.name,
              description: form.description,
              config,
              enforcement: form.enforcement,
              priority: form.priority,
              enabled: form.enabled,
            },
          },
        });
        if (result.data?.updatePolicy?.success) {
          toast({ title: 'Policy updated', status: 'success', duration: 3000 });
          policyModal.onClose();
          refetch();
        } else {
          toast({ title: 'Failed to update', description: result.data?.updatePolicy?.error, status: 'error', duration: 5000 });
        }
      } else {
        const result = await createPolicy({
          variables: {
            organizationId: organization?.id,
            input: {
              name: form.name,
              description: form.description,
              policyType: 'network_policy',
              scopeType: form.scopeType,
              config,
              enforcement: form.enforcement,
              priority: form.priority,
              enabled: form.enabled,
            },
          },
        });
        if (result.data?.createPolicy?.success) {
          toast({ title: 'Policy created', status: 'success', duration: 3000 });
          policyModal.onClose();
          refetch();
        } else {
          toast({ title: 'Failed to create', description: result.data?.createPolicy?.error, status: 'error', duration: 5000 });
        }
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, status: 'error', duration: 5000 });
    }
  };

  const handleToggle = async (policy: Policy) => {
    try {
      await togglePolicy({ variables: { id: policy.id } });
      refetch();
      toast({ title: `Policy ${policy.enabled ? 'disabled' : 'enabled'}`, status: 'success', duration: 2000 });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, status: 'error', duration: 5000 });
    }
  };

  const confirmDelete = (policy: Policy) => {
    setDeleteTarget({ id: policy.id, name: policy.name });
    deleteModal.onOpen();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deletePolicy({ variables: { id: deleteTarget.id } });
      toast({ title: 'Policy deleted', status: 'success', duration: 3000 });
      deleteModal.onClose();
      setDeleteTarget(null);
      refetch();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, status: 'error', duration: 5000 });
    }
  };

  const getEnforcementBadge = (enforcement: string) => {
    switch (enforcement) {
      case 'enforce':
        return <Badge colorScheme="red">Enforcing</Badge>;
      case 'audit':
        return <Badge colorScheme="yellow">Audit Only</Badge>;
      default:
        return <Badge colorScheme="gray">Disabled</Badge>;
    }
  };

  return (
    <Card p="20px" bg={cardBg}>
      <Flex justify="space-between" align="center" mb="20px">
        <VStack align="start" spacing="4px">
          <HStack>
            <Icon as={MdLanguage} color="brand.500" boxSize="20px" />
            <Text fontWeight="600" color={textColor}>Domain Rules</Text>
          </HStack>
          <Text fontSize="sm" color={subtleText}>
            Control outbound network access by domain
          </Text>
        </VStack>
        <HStack>
          <IconButton
            aria-label="Refresh"
            icon={<MdRefresh />}
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
          />
          <Button leftIcon={<MdAdd />} colorScheme="brand" size="sm" onClick={openCreateModal}>
            Add Rule
          </Button>
        </HStack>
      </Flex>

      {loading ? (
        <Flex justify="center" py="40px">
          <Spinner size="lg" color="brand.500" />
        </Flex>
      ) : policies.length === 0 ? (
        <VStack py="40px" spacing="16px">
          <Icon as={MdLanguage} boxSize="48px" color={subtleText} />
          <Text color={subtleText}>No domain rules configured</Text>
          <Text fontSize="sm" color={subtleText}>Create rules to control which domains agents can access</Text>
          <Button leftIcon={<MdAdd />} colorScheme="brand" size="sm" onClick={openCreateModal}>
            Create First Rule
          </Button>
        </VStack>
      ) : (
        <Box overflowX="auto">
          <Table variant="simple" size="sm">
            <Thead>
              <Tr>
                <Th borderColor={borderColor}>Name</Th>
                <Th borderColor={borderColor}>Scope</Th>
                <Th borderColor={borderColor}>Rules</Th>
                <Th borderColor={borderColor}>Mode</Th>
                <Th borderColor={borderColor}>Status</Th>
                <Th borderColor={borderColor}></Th>
              </Tr>
            </Thead>
            <Tbody>
              {policies.map((policy) => (
                <Tr key={policy.id} _hover={{ bg: hoverBg }}>
                  <Td borderColor={borderColor}>
                    <VStack align="start" spacing="2px">
                      <Text fontWeight="500" color={textColor}>{policy.name}</Text>
                      {policy.description && (
                        <Text fontSize="xs" color={subtleText} noOfLines={1}>{policy.description}</Text>
                      )}
                    </VStack>
                  </Td>
                  <Td borderColor={borderColor}>
                    <Badge colorScheme="blue">{policy.scopeType}</Badge>
                  </Td>
                  <Td borderColor={borderColor}>
                    <HStack spacing="8px">
                      {(policy.config.allowed_outbound_domains?.length || 0) > 0 && (
                        <Tooltip label={policy.config.allowed_outbound_domains?.join(', ')}>
                          <Badge colorScheme="green">
                            <HStack spacing="4px">
                              <MdCheck size={12} />
                              <Text>{policy.config.allowed_outbound_domains?.length} allowed</Text>
                            </HStack>
                          </Badge>
                        </Tooltip>
                      )}
                      {(policy.config.blocked_outbound_domains?.length || 0) > 0 && (
                        <Tooltip label={policy.config.blocked_outbound_domains?.join(', ')}>
                          <Badge colorScheme="red">
                            <HStack spacing="4px">
                              <MdBlock size={12} />
                              <Text>{policy.config.blocked_outbound_domains?.length} blocked</Text>
                            </HStack>
                          </Badge>
                        </Tooltip>
                      )}
                      {policy.config.block_public_internet && (
                        <Badge colorScheme="orange">No Public</Badge>
                      )}
                    </HStack>
                  </Td>
                  <Td borderColor={borderColor}>
                    {getEnforcementBadge(policy.enforcement)}
                  </Td>
                  <Td borderColor={borderColor}>
                    <HStack>
                      <Switch
                        size="sm"
                        isChecked={policy.enabled}
                        onChange={() => handleToggle(policy)}
                        colorScheme="green"
                      />
                      <Text fontSize="sm" color={policy.enabled ? 'green.500' : subtleText}>
                        {policy.enabled ? 'On' : 'Off'}
                      </Text>
                    </HStack>
                  </Td>
                  <Td borderColor={borderColor}>
                    <Menu>
                      <MenuButton as={IconButton} icon={<MdMoreVert />} variant="ghost" size="sm" />
                      <MenuList>
                        <MenuItem icon={<MdEdit />} onClick={() => openEditModal(policy)}>Edit</MenuItem>
                        <MenuItem icon={<MdDelete />} color="red.500" onClick={() => confirmDelete(policy)}>Delete</MenuItem>
                      </MenuList>
                    </Menu>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Box>
      )}

      {/* Create/Edit Modal */}
      <Modal isOpen={policyModal.isOpen} onClose={policyModal.onClose} size="xl">
        <ModalOverlay />
        <ModalContent bg={cardBg}>
          <ModalHeader color={textColor}>
            {editingPolicy ? 'Edit Domain Rule' : 'Create Domain Rule'}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing="16px">
              <FormControl isRequired>
                <FormLabel color={textColor}>Name</FormLabel>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., Allow AI APIs Only"
                />
              </FormControl>

              <FormControl>
                <FormLabel color={textColor}>Description</FormLabel>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Describe this rule..."
                  rows={2}
                />
              </FormControl>

              <HStack w="100%" spacing="16px">
                <FormControl>
                  <FormLabel color={textColor}>Scope</FormLabel>
                  <Select
                    value={form.scopeType}
                    onChange={(e) => setForm({ ...form, scopeType: e.target.value })}
                    isDisabled={!!editingPolicy}
                  >
                    {SCOPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </Select>
                </FormControl>

                <FormControl>
                  <FormLabel color={textColor}>Enforcement</FormLabel>
                  <Select
                    value={form.enforcement}
                    onChange={(e) => setForm({ ...form, enforcement: e.target.value })}
                  >
                    {ENFORCEMENT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </Select>
                </FormControl>
              </HStack>

              <FormControl display="flex" alignItems="center">
                <FormLabel mb="0" color={textColor}>Block all public internet access</FormLabel>
                <Switch
                  isChecked={form.blockPublicInternet}
                  onChange={(e) => setForm({ ...form, blockPublicInternet: e.target.checked })}
                  colorScheme="orange"
                />
              </FormControl>

              {form.blockPublicInternet && (
                <Alert status="warning" fontSize="sm">
                  <AlertIcon />
                  Only domains in the allow list will be accessible
                </Alert>
              )}

              {/* Domain Input */}
              <Box w="100%" pt="8px">
                <FormLabel color={textColor}>Domain Rules</FormLabel>
                <HStack mb="12px">
                  <Select
                    value={domainMode}
                    onChange={(e) => setDomainMode(e.target.value as 'allow' | 'block')}
                    w="140px"
                  >
                    <option value="allow">Allow</option>
                    <option value="block">Block</option>
                  </Select>
                  <InputGroup>
                    <Input
                      value={domainInput}
                      onChange={(e) => setDomainInput(e.target.value)}
                      placeholder="e.g., *.openai.com or api.anthropic.com"
                      onKeyPress={(e) => e.key === 'Enter' && addDomain()}
                    />
                    <InputRightElement>
                      <IconButton
                        aria-label="Add"
                        icon={<MdAdd />}
                        variant="ghost"
                        size="sm"
                        onClick={addDomain}
                      />
                    </InputRightElement>
                  </InputGroup>
                </HStack>
                <Text fontSize="xs" color={subtleText} mb="12px">
                  Use * for wildcards. Example: *.openai.com matches all subdomains
                </Text>
              </Box>

              {/* Allowed Domains */}
              {form.allowedDomains.length > 0 && (
                <Box w="100%">
                  <Text fontSize="sm" fontWeight="500" color="green.500" mb="8px">
                    <MdCheck style={{ display: 'inline', marginRight: '4px' }} />
                    Allowed Domains ({form.allowedDomains.length})
                  </Text>
                  <Wrap>
                    {form.allowedDomains.map((domain) => (
                      <WrapItem key={domain}>
                        <Tag size="md" colorScheme="green">
                          <TagLabel>{domain}</TagLabel>
                          <TagCloseButton onClick={() => removeDomain(domain, 'allow')} />
                        </Tag>
                      </WrapItem>
                    ))}
                  </Wrap>
                </Box>
              )}

              {/* Blocked Domains */}
              {form.blockedDomains.length > 0 && (
                <Box w="100%">
                  <Text fontSize="sm" fontWeight="500" color="red.500" mb="8px">
                    <MdBlock style={{ display: 'inline', marginRight: '4px' }} />
                    Blocked Domains ({form.blockedDomains.length})
                  </Text>
                  <Wrap>
                    {form.blockedDomains.map((domain) => (
                      <WrapItem key={domain}>
                        <Tag size="md" colorScheme="red">
                          <TagLabel>{domain}</TagLabel>
                          <TagCloseButton onClick={() => removeDomain(domain, 'block')} />
                        </Tag>
                      </WrapItem>
                    ))}
                  </Wrap>
                </Box>
              )}

              {form.allowedDomains.length === 0 && form.blockedDomains.length === 0 && (
                <Alert status="info" fontSize="sm">
                  <AlertIcon />
                  Add domains to allow or block. Without rules, all domains are allowed.
                </Alert>
              )}
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr="12px" onClick={policyModal.onClose}>Cancel</Button>
            <Button
              colorScheme="brand"
              onClick={handleSave}
              isLoading={creating || updating}
              isDisabled={!form.name.trim()}
            >
              {editingPolicy ? 'Update' : 'Create'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Delete Confirmation */}
      <Modal isOpen={deleteModal.isOpen} onClose={deleteModal.onClose} size="sm">
        <ModalOverlay />
        <ModalContent bg={cardBg}>
          <ModalHeader color={textColor}>
            <HStack>
              <Icon as={MdWarning} color="red.500" />
              <Text>Delete Rule</Text>
            </HStack>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text color={textColor}>
              Are you sure you want to delete "{deleteTarget?.name}"? This cannot be undone.
            </Text>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr="12px" onClick={deleteModal.onClose}>Cancel</Button>
            <Button colorScheme="red" onClick={handleDelete}>Delete</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Card>
  );
}
