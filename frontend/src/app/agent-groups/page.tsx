'use client';

import {
  Box,
  Button,
  Flex,
  Heading,
  Icon,
  Input,
  InputGroup,
  InputLeftElement,
  Select,
  SimpleGrid,
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
  FormControl,
  FormLabel,
  Textarea,
  useToast,
} from '@chakra-ui/react';
import { useQuery, useMutation } from '@apollo/client';
import { useState } from 'react';
import {
  MdAdd,
  MdSearch,
  MdMoreVert,
  MdRefresh,
  MdDelete,
  MdEdit,
  MdGroup,
} from 'react-icons/md';
import Card from 'components/card/Card';
import {
  GET_AGENT_GROUPS,
  CREATE_AGENT_GROUP,
  UPDATE_AGENT_GROUP,
  DELETE_AGENT_GROUP,
} from 'graphql/agents';

interface AgentGroup {
  id: string;
  name: string;
  slug: string;
  description: string;
  tier: string;
  color: string;
  agentCount: number;
  createdAt: string;
}

const TIER_COLORS: Record<string, string> = {
  standard: 'blue',
  restricted: 'red',
  trusted: 'green',
};

const TIER_DESCRIPTIONS: Record<string, string> = {
  standard: 'Default enforcement — policies apply as configured',
  restricted: 'Stricter enforcement — block mode default, elevated scrutiny',
  trusted: 'Relaxed enforcement — audit mode default, wider permissions',
};

const COLOR_OPTIONS = [
  { value: 'brand', label: 'Brand (Purple)' },
  { value: 'blue', label: 'Blue' },
  { value: 'green', label: 'Green' },
  { value: 'orange', label: 'Orange' },
  { value: 'red', label: 'Red' },
  { value: 'teal', label: 'Teal' },
  { value: 'cyan', label: 'Cyan' },
  { value: 'gray', label: 'Gray' },
];

const BLANK_FORM = { name: '', description: '', tier: 'standard', color: 'brand' };

export default function AgentGroupsPage() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [editing, setEditing] = useState<AgentGroup | null>(null);
  const [deleting, setDeleting] = useState<AgentGroup | null>(null);
  const [form, setForm] = useState(BLANK_FORM);

  const { isOpen: isFormOpen, onOpen: onFormOpen, onClose: onFormClose } = useDisclosure();
  const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onClose: onDeleteClose } = useDisclosure();

  const cardBg = useColorModeValue('white', 'navy.800');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.100');

  const { data, loading, error, refetch } = useQuery(GET_AGENT_GROUPS, {
    variables: {
      search: search || undefined,
      tier: tierFilter || undefined,
      first: 50,
    },
    fetchPolicy: 'cache-and-network',
  });

  const [createGroup, { loading: creating }] = useMutation(CREATE_AGENT_GROUP, {
    onCompleted: (res) => {
      if (res.createAgentGroup?.errors?.length) {
        toast({ title: res.createAgentGroup.errors[0], status: 'error' });
      } else {
        toast({ title: 'Group created', status: 'success' });
        refetch();
        handleFormClose();
      }
    },
  });

  const [updateGroup, { loading: updating }] = useMutation(UPDATE_AGENT_GROUP, {
    onCompleted: (res) => {
      if (res.updateAgentGroup?.errors?.length) {
        toast({ title: res.updateAgentGroup.errors[0], status: 'error' });
      } else {
        toast({ title: 'Group updated', status: 'success' });
        refetch();
        handleFormClose();
      }
    },
  });

  const [deleteGroup, { loading: deleteLoading }] = useMutation(DELETE_AGENT_GROUP, {
    onCompleted: (res) => {
      if (res.deleteAgentGroup?.success) {
        toast({ title: 'Group deleted', status: 'success' });
        refetch();
      } else {
        toast({ title: res.deleteAgentGroup?.errors?.[0] || 'Failed to delete', status: 'error' });
      }
      onDeleteClose();
      setDeleting(null);
    },
  });

  const groups: AgentGroup[] =
    data?.agentGroups?.edges?.map((e: { node: AgentGroup }) => e.node) || [];

  const handleFormClose = () => {
    onFormClose();
    setEditing(null);
    setForm(BLANK_FORM);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(BLANK_FORM);
    onFormOpen();
  };

  const openEdit = (group: AgentGroup) => {
    setEditing(group);
    setForm({
      name: group.name,
      description: group.description || '',
      tier: group.tier?.toLowerCase() || 'standard',
      color: group.color?.toLowerCase() || 'brand',
    });
    onFormOpen();
  };

  const openDelete = (group: AgentGroup) => {
    setDeleting(group);
    onDeleteOpen();
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast({ title: 'Name is required', status: 'warning' });
      return;
    }
    if (editing) {
      updateGroup({ variables: { id: editing.id, ...form } });
    } else {
      createGroup({ variables: form });
    }
  };

  const handleDelete = () => {
    if (deleting) {
      deleteGroup({ variables: { id: deleting.id } });
    }
  };

  return (
    <Box pt={{ base: '130px', md: '80px', xl: '80px' }}>
      {/* Header */}
      <Flex justify="space-between" align="center" mb="20px">
        <Box>
          <Heading size="lg" color={textColor}>
            Agent Groups
          </Heading>
          <Text fontSize="sm" color="secondaryGray.600">
            Organize agents into groups with tiered enforcement policies
          </Text>
        </Box>
        <Flex gap="12px">
          <Button
            variant="outline"
            leftIcon={<Icon as={MdRefresh} />}
            onClick={() => refetch()}
            isLoading={loading}
          >
            Refresh
          </Button>
          <Button variant="brand" leftIcon={<Icon as={MdAdd} />} onClick={openCreate}>
            New Group
          </Button>
        </Flex>
      </Flex>

      {/* Filters */}
      <Card p="20px" mb="24px" bg={cardBg}>
        <Flex gap="16px" flexWrap="wrap">
          <InputGroup maxW="300px">
            <InputLeftElement>
              <Icon as={MdSearch} color="gray.400" />
            </InputLeftElement>
            <Input
              placeholder="Search groups..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </InputGroup>
          <Select
            placeholder="All Tiers"
            maxW="180px"
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
          >
            <option value="standard">Standard</option>
            <option value="restricted">Restricted</option>
            <option value="trusted">Trusted</option>
          </Select>
        </Flex>
      </Card>

      {/* Loading / Error */}
      {loading && groups.length === 0 && (
        <Flex justify="center" py="40px">
          <Spinner size="xl" color="brand.500" />
        </Flex>
      )}

      {error && (
        <Card p="20px" bg={cardBg}>
          <Text color="red.500">Error loading groups: {error.message}</Text>
        </Card>
      )}

      {/* Groups Grid */}
      {groups.length > 0 && (
        <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing="20px">
          {groups.map((group) => (
            <Card key={group.id} p="20px" bg={cardBg}>
              <Flex justify="space-between" align="start" mb="12px">
                <Flex align="center" gap="10px">
                  <Icon as={MdGroup} color={`${group.color || 'brand'}.500`} boxSize="22px" />
                  <Box>
                    <Text fontSize="lg" fontWeight="600" color={textColor}>
                      {group.name}
                    </Text>
                    <Text fontSize="xs" color="gray.400" fontFamily="mono">
                      {group.slug}
                    </Text>
                  </Box>
                </Flex>
                <Menu>
                  <MenuButton as={IconButton} icon={<MdMoreVert />} variant="ghost" size="sm" />
                  <MenuList>
                    <MenuItem icon={<MdEdit />} onClick={() => openEdit(group)}>
                      Edit
                    </MenuItem>
                    <MenuItem icon={<MdDelete />} color="red.500" onClick={() => openDelete(group)}>
                      Delete
                    </MenuItem>
                  </MenuList>
                </Menu>
              </Flex>

              <Flex gap="8px" mb="12px">
                <Badge colorScheme={TIER_COLORS[group.tier?.toLowerCase()] || 'gray'} textTransform="capitalize">
                  {group.tier?.toLowerCase()}
                </Badge>
                <Badge colorScheme="gray">{group.agentCount} agent{group.agentCount !== 1 ? 's' : ''}</Badge>
              </Flex>

              {group.description ? (
                <Text fontSize="sm" color="gray.500" mb="12px" noOfLines={2}>
                  {group.description}
                </Text>
              ) : (
                <Text fontSize="sm" color="gray.400" mb="12px" fontStyle="italic">
                  {TIER_DESCRIPTIONS[group.tier]}
                </Text>
              )}

              <Box borderTop="1px solid" borderColor={borderColor} pt="10px">
                <Text fontSize="xs" color="gray.400">
                  Created {new Date(group.createdAt).toLocaleDateString()}
                </Text>
              </Box>
            </Card>
          ))}
        </SimpleGrid>
      )}

      {/* Empty State */}
      {!loading && groups.length === 0 && !error && (
        <Card p="60px" bg={cardBg} textAlign="center">
          <Flex direction="column" align="center" gap="12px">
            <Icon as={MdGroup} boxSize="48px" color="gray.400" />
            <Text fontSize="lg" color={textColor} fontWeight="600">
              No agent groups yet
            </Text>
            <Text color="gray.500" maxW="400px">
              Group your agents by trust tier — standard, restricted, or trusted — to apply
              differentiated enforcement policies.
            </Text>
            <Button variant="brand" leftIcon={<Icon as={MdAdd} />} mt="8px" onClick={openCreate}>
              Create First Group
            </Button>
          </Flex>
        </Card>
      )}

      {/* Create / Edit Modal */}
      <Modal isOpen={isFormOpen} onClose={handleFormClose} size="md">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{editing ? 'Edit Group' : 'New Agent Group'}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Flex direction="column" gap="16px">
              <FormControl isRequired>
                <FormLabel>Name</FormLabel>
                <Input
                  placeholder="e.g. Production Agents"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </FormControl>

              <FormControl>
                <FormLabel>Description</FormLabel>
                <Textarea
                  placeholder="Optional description..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                />
              </FormControl>

              <FormControl>
                <FormLabel>Tier</FormLabel>
                <Select value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })}>
                  <option value="standard">Standard — default enforcement</option>
                  <option value="restricted">Restricted — stricter, block mode default</option>
                  <option value="trusted">Trusted — relaxed, audit mode default</option>
                </Select>
              </FormControl>

              <FormControl>
                <FormLabel>Color</FormLabel>
                <Select value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })}>
                  {COLOR_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </FormControl>
            </Flex>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={handleFormClose}>
              Cancel
            </Button>
            <Button
              variant="brand"
              onClick={handleSubmit}
              isLoading={creating || updating}
            >
              {editing ? 'Save Changes' : 'Create Group'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Delete Confirmation */}
      <Modal isOpen={isDeleteOpen} onClose={onDeleteClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Delete Group</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            Delete <strong>{deleting?.name}</strong>? Agents in this group will be unassigned but not deleted.
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onDeleteClose}>
              Cancel
            </Button>
            <Button colorScheme="red" onClick={handleDelete} isLoading={deleteLoading}>
              Delete
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
