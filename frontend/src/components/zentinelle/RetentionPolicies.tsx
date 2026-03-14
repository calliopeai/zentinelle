'use client';

import { useState, useMemo } from 'react';
import {
  VStack,
  HStack,
  Text,
  Icon,
  useColorModeValue,
  SimpleGrid,
  Button,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  IconButton,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  FormControl,
  FormLabel,
  Input,
  Select,
  Textarea,
  Switch,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  useToast,
  Spinner,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Tooltip,
  Flex,
  Box,
} from '@chakra-ui/react';
import {
  MdArchive,
  MdGavel,
  MdSchedule,
  MdAdd,
  MdMoreVert,
  MdEdit,
  MdDelete,
  MdCheck,
  MdClose,
  MdRefresh,
  MdWarning,
  MdInfo,
} from 'react-icons/md';
import { useQuery, useMutation } from '@apollo/client';
import Card from 'components/card/Card';
import {
  GET_RETENTION_POLICIES,
  GET_LEGAL_HOLDS,
  GET_RETENTION_OPTIONS,
  GET_LEGAL_HOLD_OPTIONS,
  CREATE_RETENTION_POLICY,
  UPDATE_RETENTION_POLICY,
  DELETE_RETENTION_POLICY,
  TOGGLE_RETENTION_POLICY_ENABLED,
  CREATE_LEGAL_HOLD,
  UPDATE_LEGAL_HOLD,
  RELEASE_LEGAL_HOLD,
  DELETE_LEGAL_HOLD,
} from 'graphql/retention';
import { useOrganization } from 'contexts/OrganizationContext';

interface RetentionPolicy {
  id: string;
  name: string;
  description: string;
  entityType: string;
  entityTypeDisplay: string;
  deploymentName: string | null;
  retentionDays: number;
  minimumRetentionDays: number | null;
  expirationAction: string;
  expirationActionDisplay: string;
  archiveLocation: string;
  complianceRequirement: string;
  complianceRequirementDisplay: string;
  complianceNotes: string;
  enabled: boolean;
  priority: number;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

interface LegalHold {
  id: string;
  name: string;
  description: string;
  referenceNumber: string;
  holdType: string;
  holdTypeDisplay: string;
  status: string;
  statusDisplay: string;
  appliesToAll: boolean;
  entityTypes: string[];
  userIdentifiers: string[];
  dataFrom: string | null;
  dataTo: string | null;
  effectiveDate: string;
  expirationDate: string | null;
  releasedAt: string | null;
  custodianName: string;
  custodianEmail: string;
  notifyOnAccess: boolean;
  notificationEmails: string[];
  isActive: boolean;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

interface SelectOption {
  value: string;
  label: string;
}

const DEFAULT_RETENTION_POLICY = {
  name: '',
  description: '',
  entityType: 'all',
  retentionDays: 90,
  minimumRetentionDays: null as number | null,
  expirationAction: 'delete',
  archiveLocation: '',
  complianceRequirement: 'none',
  complianceNotes: '',
  enabled: true,
  priority: 0,
};

const DEFAULT_LEGAL_HOLD = {
  name: '',
  description: '',
  referenceNumber: '',
  holdType: 'preservation',
  appliesToAll: false,
  entityTypes: [] as string[],
  userIdentifiers: [] as string[],
  dataFrom: '',
  dataTo: '',
  expirationDate: '',
  custodianEmail: '',
  notifyOnAccess: false,
  notificationEmails: [] as string[],
};

export default function RetentionPolicies() {
  const cardBg = useColorModeValue('white', 'navy.800');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const subtleText = useColorModeValue('gray.500', 'gray.400');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.100');
  const hoverBg = useColorModeValue('gray.50', 'whiteAlpha.100');
  const toast = useToast();
  const { organization } = useOrganization();

  const [tabIndex, setTabIndex] = useState(0);
  const [editingPolicy, setEditingPolicy] = useState<RetentionPolicy | null>(null);
  const [editingHold, setEditingHold] = useState<LegalHold | null>(null);
  const [policyForm, setPolicyForm] = useState(DEFAULT_RETENTION_POLICY);
  const [holdForm, setHoldForm] = useState(DEFAULT_LEGAL_HOLD);

  const policyModal = useDisclosure();
  const holdModal = useDisclosure();
  const deleteModal = useDisclosure();
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'policy' | 'hold'; id: string; name: string } | null>(null);

  // Queries
  const { data: policiesData, loading: policiesLoading, refetch: refetchPolicies } = useQuery(GET_RETENTION_POLICIES, {
    variables: { first: 50 },
    skip: !organization?.id,
  });

  const { data: holdsData, loading: holdsLoading, refetch: refetchHolds } = useQuery(GET_LEGAL_HOLDS, {
    variables: { first: 50 },
    skip: !organization?.id,
  });

  const { data: optionsData } = useQuery(GET_RETENTION_OPTIONS);
  const { data: holdOptionsData } = useQuery(GET_LEGAL_HOLD_OPTIONS);

  // Mutations
  const [createPolicy, { loading: creatingPolicy }] = useMutation(CREATE_RETENTION_POLICY);
  const [updatePolicy, { loading: updatingPolicy }] = useMutation(UPDATE_RETENTION_POLICY);
  const [deletePolicy] = useMutation(DELETE_RETENTION_POLICY);
  const [togglePolicyEnabled] = useMutation(TOGGLE_RETENTION_POLICY_ENABLED);
  const [createHold, { loading: creatingHold }] = useMutation(CREATE_LEGAL_HOLD);
  const [updateHold, { loading: updatingHold }] = useMutation(UPDATE_LEGAL_HOLD);
  const [releaseHold] = useMutation(RELEASE_LEGAL_HOLD);
  const [deleteHold] = useMutation(DELETE_LEGAL_HOLD);

  const policies = useMemo(() => {
    return policiesData?.retentionPolicies?.edges?.map((e: any) => e.node) || [];
  }, [policiesData]);

  const holds = useMemo(() => {
    return holdsData?.legalHolds?.edges?.map((e: any) => e.node) || [];
  }, [holdsData]);

  const entityTypeOptions: SelectOption[] = optionsData?.retentionOptions?.entityTypes || [];
  const expirationActionOptions: SelectOption[] = optionsData?.retentionOptions?.expirationActions || [];
  const complianceOptions: SelectOption[] = optionsData?.retentionOptions?.complianceRequirements || [];
  const holdTypeOptions: SelectOption[] = holdOptionsData?.legalHoldOptions?.holdTypes || [];

  // Stats
  const stats = useMemo(() => {
    const activeHolds = holds.filter((h: LegalHold) => h.isActive).length;
    const enabledPolicies = policies.filter((p: RetentionPolicy) => p.enabled).length;
    return { activeHolds, enabledPolicies, totalPolicies: policies.length, totalHolds: holds.length };
  }, [policies, holds]);

  // Handlers
  const openCreatePolicy = () => {
    setEditingPolicy(null);
    setPolicyForm(DEFAULT_RETENTION_POLICY);
    policyModal.onOpen();
  };

  const openEditPolicy = (policy: RetentionPolicy) => {
    setEditingPolicy(policy);
    setPolicyForm({
      name: policy.name,
      description: policy.description,
      entityType: policy.entityType,
      retentionDays: policy.retentionDays,
      minimumRetentionDays: policy.minimumRetentionDays,
      expirationAction: policy.expirationAction,
      archiveLocation: policy.archiveLocation,
      complianceRequirement: policy.complianceRequirement,
      complianceNotes: policy.complianceNotes,
      enabled: policy.enabled,
      priority: policy.priority,
    });
    policyModal.onOpen();
  };

  const openCreateHold = () => {
    setEditingHold(null);
    setHoldForm(DEFAULT_LEGAL_HOLD);
    holdModal.onOpen();
  };

  const openEditHold = (hold: LegalHold) => {
    setEditingHold(hold);
    setHoldForm({
      name: hold.name,
      description: hold.description,
      referenceNumber: hold.referenceNumber,
      holdType: hold.holdType,
      appliesToAll: hold.appliesToAll,
      entityTypes: hold.entityTypes,
      userIdentifiers: hold.userIdentifiers,
      dataFrom: hold.dataFrom || '',
      dataTo: hold.dataTo || '',
      expirationDate: hold.expirationDate || '',
      custodianEmail: hold.custodianEmail,
      notifyOnAccess: hold.notifyOnAccess,
      notificationEmails: hold.notificationEmails,
    });
    holdModal.onOpen();
  };

  const handleSavePolicy = async () => {
    try {
      if (editingPolicy) {
        const result = await updatePolicy({
          variables: {
            input: {
              id: editingPolicy.id,
              ...policyForm,
            },
          },
        });
        if (result.data?.updateRetentionPolicy?.success) {
          toast({ title: 'Policy updated', status: 'success', duration: 3000 });
          policyModal.onClose();
          refetchPolicies();
        } else {
          toast({ title: 'Failed to update policy', description: result.data?.updateRetentionPolicy?.errors?.join(', '), status: 'error', duration: 5000 });
        }
      } else {
        const result = await createPolicy({
          variables: { input: policyForm },
        });
        if (result.data?.createRetentionPolicy?.success) {
          toast({ title: 'Policy created', status: 'success', duration: 3000 });
          policyModal.onClose();
          refetchPolicies();
        } else {
          toast({ title: 'Failed to create policy', description: result.data?.createRetentionPolicy?.errors?.join(', '), status: 'error', duration: 5000 });
        }
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, status: 'error', duration: 5000 });
    }
  };

  const handleSaveHold = async () => {
    try {
      if (editingHold) {
        const result = await updateHold({
          variables: {
            input: {
              id: editingHold.id,
              ...holdForm,
              dataFrom: holdForm.dataFrom || null,
              dataTo: holdForm.dataTo || null,
              expirationDate: holdForm.expirationDate || null,
            },
          },
        });
        if (result.data?.updateLegalHold?.success) {
          toast({ title: 'Hold updated', status: 'success', duration: 3000 });
          holdModal.onClose();
          refetchHolds();
        } else {
          toast({ title: 'Failed to update hold', description: result.data?.updateLegalHold?.errors?.join(', '), status: 'error', duration: 5000 });
        }
      } else {
        const result = await createHold({
          variables: {
            input: {
              ...holdForm,
              dataFrom: holdForm.dataFrom || null,
              dataTo: holdForm.dataTo || null,
              expirationDate: holdForm.expirationDate || null,
            },
          },
        });
        if (result.data?.createLegalHold?.success) {
          toast({ title: 'Hold created', status: 'success', duration: 3000 });
          holdModal.onClose();
          refetchHolds();
        } else {
          toast({ title: 'Failed to create hold', description: result.data?.createLegalHold?.errors?.join(', '), status: 'error', duration: 5000 });
        }
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, status: 'error', duration: 5000 });
    }
  };

  const handleTogglePolicy = async (policy: RetentionPolicy) => {
    try {
      await togglePolicyEnabled({
        variables: { id: policy.id, enabled: !policy.enabled },
      });
      refetchPolicies();
      toast({ title: `Policy ${policy.enabled ? 'disabled' : 'enabled'}`, status: 'success', duration: 2000 });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, status: 'error', duration: 5000 });
    }
  };

  const handleReleaseHold = async (hold: LegalHold) => {
    try {
      const result = await releaseHold({ variables: { id: hold.id } });
      if (result.data?.releaseLegalHold?.success) {
        toast({ title: 'Hold released', status: 'success', duration: 3000 });
        refetchHolds();
      }
    } catch (error: any) {
      toast({ title: 'Error releasing hold', description: error.message, status: 'error', duration: 5000 });
    }
  };

  const confirmDelete = (type: 'policy' | 'hold', id: string, name: string) => {
    setDeleteTarget({ type, id, name });
    deleteModal.onOpen();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'policy') {
        await deletePolicy({ variables: { id: deleteTarget.id } });
        refetchPolicies();
      } else {
        await deleteHold({ variables: { id: deleteTarget.id } });
        refetchHolds();
      }
      toast({ title: `${deleteTarget.type === 'policy' ? 'Policy' : 'Hold'} deleted`, status: 'success', duration: 3000 });
      deleteModal.onClose();
      setDeleteTarget(null);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, status: 'error', duration: 5000 });
    }
  };

  const getComplianceBadge = (compliance: string) => {
    const colors: Record<string, string> = {
      none: 'gray',
      gdpr: 'purple',
      ccpa: 'blue',
      hipaa: 'red',
      sox: 'orange',
      pci_dss: 'yellow',
      soc2: 'green',
      custom: 'cyan',
    };
    return colors[compliance] || 'gray';
  };

  const getStatusBadge = (status: string, isActive: boolean) => {
    if (status === 'released') return 'gray';
    if (status === 'expired') return 'orange';
    return isActive ? 'green' : 'red';
  };

  return (
    <VStack spacing="20px" align="stretch">
      {/* Stats Overview */}
      <SimpleGrid columns={{ base: 2, md: 4 }} spacing="20px">
        <Card p="20px" bg={cardBg}>
          <Stat>
            <StatLabel color={subtleText}>Retention Policies</StatLabel>
            <StatNumber color={textColor}>{stats.totalPolicies}</StatNumber>
            <StatHelpText color="green.500">{stats.enabledPolicies} enabled</StatHelpText>
          </Stat>
        </Card>
        <Card p="20px" bg={cardBg}>
          <Stat>
            <StatLabel color={subtleText}>Legal Holds</StatLabel>
            <StatNumber color={textColor}>{stats.totalHolds}</StatNumber>
            <StatHelpText color="orange.500">{stats.activeHolds} active</StatHelpText>
          </Stat>
        </Card>
        <Card p="20px" bg={cardBg}>
          <Stat>
            <StatLabel color={subtleText}>Compliance</StatLabel>
            <StatNumber color={textColor}>
              {policies.filter((p: RetentionPolicy) => p.complianceRequirement !== 'none').length}
            </StatNumber>
            <StatHelpText color={subtleText}>with requirements</StatHelpText>
          </Stat>
        </Card>
        <Card p="20px" bg={cardBg}>
          <Stat>
            <StatLabel color={subtleText}>Data Types</StatLabel>
            <StatNumber color={textColor}>
              {new Set(policies.map((p: RetentionPolicy) => p.entityType)).size}
            </StatNumber>
            <StatHelpText color={subtleText}>covered</StatHelpText>
          </Stat>
        </Card>
      </SimpleGrid>

      {/* Main Content */}
      <Card p="20px" bg={cardBg}>
        <Tabs index={tabIndex} onChange={setTabIndex} variant="soft-rounded" colorScheme="brand">
          <Flex justify="space-between" align="center" mb="20px" flexWrap="wrap" gap="12px">
            <TabList>
              <Tab><Icon as={MdSchedule} mr="8px" /> Retention Policies</Tab>
              <Tab><Icon as={MdGavel} mr="8px" /> Legal Holds</Tab>
            </TabList>
            <HStack>
              <IconButton
                aria-label="Refresh"
                icon={<MdRefresh />}
                variant="ghost"
                size="sm"
                onClick={() => { refetchPolicies(); refetchHolds(); }}
              />
              <Button
                leftIcon={<MdAdd />}
                colorScheme="brand"
                size="sm"
                onClick={tabIndex === 0 ? openCreatePolicy : openCreateHold}
              >
                {tabIndex === 0 ? 'Add Policy' : 'Add Hold'}
              </Button>
            </HStack>
          </Flex>

          <TabPanels>
            {/* Retention Policies Tab */}
            <TabPanel p="0">
              {policiesLoading ? (
                <Flex justify="center" py="40px">
                  <Spinner size="lg" color="brand.500" />
                </Flex>
              ) : policies.length === 0 ? (
                <VStack py="40px" spacing="16px">
                  <Icon as={MdArchive} boxSize="48px" color={subtleText} />
                  <Text color={subtleText}>No retention policies configured</Text>
                  <Button leftIcon={<MdAdd />} colorScheme="brand" size="sm" onClick={openCreatePolicy}>
                    Create First Policy
                  </Button>
                </VStack>
              ) : (
                <Box overflowX="auto">
                  <Table variant="simple" size="sm">
                    <Thead>
                      <Tr>
                        <Th borderColor={borderColor}>Name</Th>
                        <Th borderColor={borderColor}>Data Type</Th>
                        <Th borderColor={borderColor}>Retention</Th>
                        <Th borderColor={borderColor}>Action</Th>
                        <Th borderColor={borderColor}>Compliance</Th>
                        <Th borderColor={borderColor}>Status</Th>
                        <Th borderColor={borderColor}></Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {policies.map((policy: RetentionPolicy) => (
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
                            <Badge colorScheme="blue">{policy.entityTypeDisplay}</Badge>
                          </Td>
                          <Td borderColor={borderColor}>
                            <Text color={textColor}>{policy.retentionDays} days</Text>
                            {policy.minimumRetentionDays && (
                              <Text fontSize="xs" color={subtleText}>min: {policy.minimumRetentionDays}</Text>
                            )}
                          </Td>
                          <Td borderColor={borderColor}>
                            <Badge colorScheme={policy.expirationAction === 'delete' ? 'red' : policy.expirationAction === 'archive' ? 'blue' : 'yellow'}>
                              {policy.expirationActionDisplay}
                            </Badge>
                          </Td>
                          <Td borderColor={borderColor}>
                            <Badge colorScheme={getComplianceBadge(policy.complianceRequirement)}>
                              {policy.complianceRequirementDisplay}
                            </Badge>
                          </Td>
                          <Td borderColor={borderColor}>
                            <HStack>
                              <Switch
                                size="sm"
                                isChecked={policy.enabled}
                                onChange={() => handleTogglePolicy(policy)}
                                colorScheme="green"
                              />
                              <Text fontSize="sm" color={policy.enabled ? 'green.500' : subtleText}>
                                {policy.enabled ? 'Active' : 'Disabled'}
                              </Text>
                            </HStack>
                          </Td>
                          <Td borderColor={borderColor}>
                            <Menu>
                              <MenuButton as={IconButton} icon={<MdMoreVert />} variant="ghost" size="sm" />
                              <MenuList>
                                <MenuItem icon={<MdEdit />} onClick={() => openEditPolicy(policy)}>Edit</MenuItem>
                                <MenuItem icon={<MdDelete />} color="red.500" onClick={() => confirmDelete('policy', policy.id, policy.name)}>
                                  Delete
                                </MenuItem>
                              </MenuList>
                            </Menu>
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </Box>
              )}
            </TabPanel>

            {/* Legal Holds Tab */}
            <TabPanel p="0">
              {holdsLoading ? (
                <Flex justify="center" py="40px">
                  <Spinner size="lg" color="brand.500" />
                </Flex>
              ) : holds.length === 0 ? (
                <VStack py="40px" spacing="16px">
                  <Icon as={MdGavel} boxSize="48px" color={subtleText} />
                  <Text color={subtleText}>No legal holds active</Text>
                  <Button leftIcon={<MdAdd />} colorScheme="brand" size="sm" onClick={openCreateHold}>
                    Create Legal Hold
                  </Button>
                </VStack>
              ) : (
                <Box overflowX="auto">
                  <Table variant="simple" size="sm">
                    <Thead>
                      <Tr>
                        <Th borderColor={borderColor}>Name</Th>
                        <Th borderColor={borderColor}>Reference</Th>
                        <Th borderColor={borderColor}>Type</Th>
                        <Th borderColor={borderColor}>Scope</Th>
                        <Th borderColor={borderColor}>Status</Th>
                        <Th borderColor={borderColor}>Effective</Th>
                        <Th borderColor={borderColor}></Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {holds.map((hold: LegalHold) => (
                        <Tr key={hold.id} _hover={{ bg: hoverBg }}>
                          <Td borderColor={borderColor}>
                            <VStack align="start" spacing="2px">
                              <Text fontWeight="500" color={textColor}>{hold.name}</Text>
                              {hold.custodianEmail && (
                                <Text fontSize="xs" color={subtleText}>{hold.custodianEmail}</Text>
                              )}
                            </VStack>
                          </Td>
                          <Td borderColor={borderColor}>
                            <Text fontSize="sm" color={textColor}>{hold.referenceNumber || '-'}</Text>
                          </Td>
                          <Td borderColor={borderColor}>
                            <Badge colorScheme="purple">{hold.holdTypeDisplay}</Badge>
                          </Td>
                          <Td borderColor={borderColor}>
                            {hold.appliesToAll ? (
                              <Badge colorScheme="red">All Data</Badge>
                            ) : (
                              <Text fontSize="sm" color={subtleText}>
                                {hold.entityTypes.length} types
                              </Text>
                            )}
                          </Td>
                          <Td borderColor={borderColor}>
                            <Badge colorScheme={getStatusBadge(hold.status, hold.isActive)}>
                              {hold.statusDisplay}
                            </Badge>
                          </Td>
                          <Td borderColor={borderColor}>
                            <Text fontSize="sm" color={textColor}>
                              {new Date(hold.effectiveDate).toLocaleDateString()}
                            </Text>
                            {hold.expirationDate && (
                              <Text fontSize="xs" color={subtleText}>
                                expires: {new Date(hold.expirationDate).toLocaleDateString()}
                              </Text>
                            )}
                          </Td>
                          <Td borderColor={borderColor}>
                            <Menu>
                              <MenuButton as={IconButton} icon={<MdMoreVert />} variant="ghost" size="sm" />
                              <MenuList>
                                <MenuItem icon={<MdEdit />} onClick={() => openEditHold(hold)}>Edit</MenuItem>
                                {hold.isActive && (
                                  <MenuItem icon={<MdClose />} color="orange.500" onClick={() => handleReleaseHold(hold)}>
                                    Release Hold
                                  </MenuItem>
                                )}
                                <MenuItem icon={<MdDelete />} color="red.500" onClick={() => confirmDelete('hold', hold.id, hold.name)}>
                                  Delete
                                </MenuItem>
                              </MenuList>
                            </Menu>
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </Box>
              )}
            </TabPanel>
          </TabPanels>
        </Tabs>
      </Card>

      {/* Retention Policy Modal */}
      <Modal isOpen={policyModal.isOpen} onClose={policyModal.onClose} size="xl">
        <ModalOverlay />
        <ModalContent bg={cardBg}>
          <ModalHeader color={textColor}>{editingPolicy ? 'Edit Policy' : 'Create Retention Policy'}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing="16px">
              <FormControl isRequired>
                <FormLabel color={textColor}>Name</FormLabel>
                <Input
                  value={policyForm.name}
                  onChange={(e) => setPolicyForm({ ...policyForm, name: e.target.value })}
                  placeholder="e.g., GDPR Compliance - Events"
                />
              </FormControl>

              <FormControl>
                <FormLabel color={textColor}>Description</FormLabel>
                <Textarea
                  value={policyForm.description}
                  onChange={(e) => setPolicyForm({ ...policyForm, description: e.target.value })}
                  placeholder="Describe this policy's purpose..."
                  rows={2}
                />
              </FormControl>

              <SimpleGrid columns={2} spacing="16px" w="100%">
                <FormControl isRequired>
                  <FormLabel color={textColor}>Data Type</FormLabel>
                  <Select
                    value={policyForm.entityType}
                    onChange={(e) => setPolicyForm({ ...policyForm, entityType: e.target.value })}
                  >
                    {entityTypeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </Select>
                </FormControl>

                <FormControl isRequired>
                  <FormLabel color={textColor}>Retention Days</FormLabel>
                  <NumberInput
                    value={policyForm.retentionDays}
                    onChange={(_, val) => setPolicyForm({ ...policyForm, retentionDays: val || 90 })}
                    min={1}
                    max={3650}
                  >
                    <NumberInputField />
                    <NumberInputStepper>
                      <NumberIncrementStepper />
                      <NumberDecrementStepper />
                    </NumberInputStepper>
                  </NumberInput>
                </FormControl>
              </SimpleGrid>

              <SimpleGrid columns={2} spacing="16px" w="100%">
                <FormControl isRequired>
                  <FormLabel color={textColor}>Expiration Action</FormLabel>
                  <Select
                    value={policyForm.expirationAction}
                    onChange={(e) => setPolicyForm({ ...policyForm, expirationAction: e.target.value })}
                  >
                    {expirationActionOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </Select>
                </FormControl>

                <FormControl>
                  <FormLabel color={textColor}>Compliance Requirement</FormLabel>
                  <Select
                    value={policyForm.complianceRequirement}
                    onChange={(e) => setPolicyForm({ ...policyForm, complianceRequirement: e.target.value })}
                  >
                    {complianceOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </Select>
                </FormControl>
              </SimpleGrid>

              {policyForm.expirationAction === 'archive' && (
                <FormControl>
                  <FormLabel color={textColor}>Archive Location</FormLabel>
                  <Input
                    value={policyForm.archiveLocation}
                    onChange={(e) => setPolicyForm({ ...policyForm, archiveLocation: e.target.value })}
                    placeholder="s3://bucket/path"
                  />
                </FormControl>
              )}

              <FormControl>
                <FormLabel color={textColor}>Compliance Notes</FormLabel>
                <Textarea
                  value={policyForm.complianceNotes}
                  onChange={(e) => setPolicyForm({ ...policyForm, complianceNotes: e.target.value })}
                  placeholder="Notes about compliance requirements..."
                  rows={2}
                />
              </FormControl>

              <HStack w="100%" justify="space-between">
                <FormControl display="flex" alignItems="center" w="auto">
                  <FormLabel mb="0" color={textColor}>Enabled</FormLabel>
                  <Switch
                    isChecked={policyForm.enabled}
                    onChange={(e) => setPolicyForm({ ...policyForm, enabled: e.target.checked })}
                    colorScheme="green"
                  />
                </FormControl>

                <FormControl w="150px">
                  <FormLabel color={textColor}>Priority</FormLabel>
                  <NumberInput
                    value={policyForm.priority}
                    onChange={(_, val) => setPolicyForm({ ...policyForm, priority: val || 0 })}
                    min={0}
                    max={100}
                    size="sm"
                  >
                    <NumberInputField />
                  </NumberInput>
                </FormControl>
              </HStack>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr="12px" onClick={policyModal.onClose}>Cancel</Button>
            <Button
              colorScheme="brand"
              onClick={handleSavePolicy}
              isLoading={creatingPolicy || updatingPolicy}
              isDisabled={!policyForm.name}
            >
              {editingPolicy ? 'Update' : 'Create'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Legal Hold Modal */}
      <Modal isOpen={holdModal.isOpen} onClose={holdModal.onClose} size="xl">
        <ModalOverlay />
        <ModalContent bg={cardBg}>
          <ModalHeader color={textColor}>{editingHold ? 'Edit Legal Hold' : 'Create Legal Hold'}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing="16px">
              <FormControl isRequired>
                <FormLabel color={textColor}>Name</FormLabel>
                <Input
                  value={holdForm.name}
                  onChange={(e) => setHoldForm({ ...holdForm, name: e.target.value })}
                  placeholder="e.g., SEC Investigation Q1 2024"
                />
              </FormControl>

              <SimpleGrid columns={2} spacing="16px" w="100%">
                <FormControl>
                  <FormLabel color={textColor}>Reference Number</FormLabel>
                  <Input
                    value={holdForm.referenceNumber}
                    onChange={(e) => setHoldForm({ ...holdForm, referenceNumber: e.target.value })}
                    placeholder="Case/Matter #"
                  />
                </FormControl>

                <FormControl isRequired>
                  <FormLabel color={textColor}>Hold Type</FormLabel>
                  <Select
                    value={holdForm.holdType}
                    onChange={(e) => setHoldForm({ ...holdForm, holdType: e.target.value })}
                  >
                    {holdTypeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </Select>
                </FormControl>
              </SimpleGrid>

              <FormControl>
                <FormLabel color={textColor}>Description</FormLabel>
                <Textarea
                  value={holdForm.description}
                  onChange={(e) => setHoldForm({ ...holdForm, description: e.target.value })}
                  placeholder="Describe the hold and its scope..."
                  rows={2}
                />
              </FormControl>

              <FormControl display="flex" alignItems="center">
                <FormLabel mb="0" color={textColor}>Apply to All Data</FormLabel>
                <Switch
                  isChecked={holdForm.appliesToAll}
                  onChange={(e) => setHoldForm({ ...holdForm, appliesToAll: e.target.checked })}
                  colorScheme="red"
                />
                {holdForm.appliesToAll && (
                  <Badge ml="12px" colorScheme="red">All organization data will be preserved</Badge>
                )}
              </FormControl>

              <SimpleGrid columns={2} spacing="16px" w="100%">
                <FormControl>
                  <FormLabel color={textColor}>Data From</FormLabel>
                  <Input
                    type="date"
                    value={holdForm.dataFrom}
                    onChange={(e) => setHoldForm({ ...holdForm, dataFrom: e.target.value })}
                  />
                </FormControl>

                <FormControl>
                  <FormLabel color={textColor}>Data To</FormLabel>
                  <Input
                    type="date"
                    value={holdForm.dataTo}
                    onChange={(e) => setHoldForm({ ...holdForm, dataTo: e.target.value })}
                  />
                </FormControl>
              </SimpleGrid>

              <FormControl>
                <FormLabel color={textColor}>Expiration Date</FormLabel>
                <Input
                  type="date"
                  value={holdForm.expirationDate}
                  onChange={(e) => setHoldForm({ ...holdForm, expirationDate: e.target.value })}
                />
                <Text fontSize="xs" color={subtleText} mt="4px">Leave empty for indefinite hold</Text>
              </FormControl>

              <FormControl>
                <FormLabel color={textColor}>Custodian Email</FormLabel>
                <Input
                  type="email"
                  value={holdForm.custodianEmail}
                  onChange={(e) => setHoldForm({ ...holdForm, custodianEmail: e.target.value })}
                  placeholder="legal@company.com"
                />
              </FormControl>

              <FormControl display="flex" alignItems="center">
                <FormLabel mb="0" color={textColor}>Notify on Data Access</FormLabel>
                <Switch
                  isChecked={holdForm.notifyOnAccess}
                  onChange={(e) => setHoldForm({ ...holdForm, notifyOnAccess: e.target.checked })}
                  colorScheme="blue"
                />
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr="12px" onClick={holdModal.onClose}>Cancel</Button>
            <Button
              colorScheme="brand"
              onClick={handleSaveHold}
              isLoading={creatingHold || updatingHold}
              isDisabled={!holdForm.name}
            >
              {editingHold ? 'Update' : 'Create'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={deleteModal.isOpen} onClose={deleteModal.onClose} size="sm">
        <ModalOverlay />
        <ModalContent bg={cardBg}>
          <ModalHeader color={textColor}>
            <HStack>
              <Icon as={MdWarning} color="red.500" />
              <Text>Confirm Delete</Text>
            </HStack>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text color={textColor}>
              Are you sure you want to delete "{deleteTarget?.name}"? This action cannot be undone.
            </Text>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr="12px" onClick={deleteModal.onClose}>Cancel</Button>
            <Button colorScheme="red" onClick={handleDelete}>Delete</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </VStack>
  );
}
