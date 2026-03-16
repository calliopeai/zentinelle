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
  useToast,
  Tooltip,
} from '@chakra-ui/react';
import { useQuery, useMutation } from '@apollo/client';
import { useState } from 'react';
import { MdAdd, MdSearch, MdMoreVert, MdRefresh, MdDelete, MdKey, MdCopyAll } from 'react-icons/md';
import { useRouter } from 'next/navigation';
import Card from 'components/card/Card';
import { GET_AGENTS, DELETE_AGENT, REGENERATE_API_KEY } from 'graphql/agents';
import { usePageHeader } from 'contexts/PageHeaderContext';

interface AgentEndpoint {
  id: string;
  agentId: string;
  agentType: string;
  name: string;
  description: string;
  status: string;
  health: string;
  capabilities: string;
  metadata: string;
  lastHeartbeat: string;
  apiKeyPrefix: string;
  deploymentName: string;
  createdAt: string;
  updatedAt: string;
}

function getStatusColor(status: string): string {
  switch (status?.toLowerCase()) {
    case 'active':
      return 'green';
    case 'inactive':
      return 'gray';
    case 'suspended':
      return 'orange';
    case 'pending':
      return 'blue';
    default:
      return 'gray';
  }
}

function getHealthColor(health: string): string {
  switch (health?.toLowerCase()) {
    case 'healthy':
      return 'green';
    case 'degraded':
      return 'yellow';
    case 'unhealthy':
      return 'red';
    default:
      return 'gray';
  }
}

function formatDate(dateString: string): string {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

function timeAgo(dateString: string): string {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function AgentsPage() {
  usePageHeader('AI Agents', 'Manage and monitor your registered AI agents');
  const router = useRouter();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [selectedEndpoint, setSelectedEndpoint] = useState<AgentEndpoint | null>(null);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);

  const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onClose: onDeleteClose } = useDisclosure();
  const { isOpen: isKeyOpen, onOpen: onKeyOpen, onClose: onKeyClose } = useDisclosure();

  const cardBg = useColorModeValue('white', 'navy.800');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.100');

  const { data, loading, error, refetch } = useQuery(GET_AGENTS, {
    variables: {
      search: search || undefined,
      status: statusFilter || undefined,
      agentType: typeFilter || undefined,
      first: 50,
    },
    fetchPolicy: 'cache-and-network',
  });

  const [deleteEndpoint, { loading: deleting }] = useMutation(DELETE_AGENT, {
    onCompleted: (result) => {
      if (result.deleteAgentEndpoint?.success) {
        toast({ title: 'Agent deleted successfully', status: 'success' });
        refetch();
      } else {
        toast({ title: 'Failed to delete agent', description: result.deleteAgentEndpoint?.error, status: 'error' });
      }
      onDeleteClose();
    },
  });

  const [regenerateApiKey, { loading: regenerating }] = useMutation(REGENERATE_API_KEY, {
    onCompleted: (result) => {
      if (result.regenerateEndpointApiKey?.apiKey) {
        setNewApiKey(result.regenerateEndpointApiKey.apiKey);
        toast({ title: 'API key regenerated successfully', status: 'success' });
        refetch();
      } else {
        toast({ title: 'Failed to regenerate API key', description: result.regenerateEndpointApiKey?.error, status: 'error' });
      }
    },
  });

  const endpoints: AgentEndpoint[] = data?.endpoints?.edges?.map((edge: { node: AgentEndpoint }) => edge.node) || [];

  const handleDelete = () => {
    if (selectedEndpoint) {
      deleteEndpoint({ variables: { id: selectedEndpoint.id } });
    }
  };

  const handleRegenerateKey = (endpoint: AgentEndpoint) => {
    setSelectedEndpoint(endpoint);
    regenerateApiKey({ variables: { endpointId: endpoint.id } });
    onKeyOpen();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied to clipboard', status: 'info', duration: 2000 });
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
            onClick={() => router.push('/agents/register')}
          >
            Register Agent
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
              placeholder="Search agents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </InputGroup>
          <Select
            placeholder="All Statuses"
            maxW="180px"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
            <option value="pending">Pending</option>
          </Select>
          <Select
            placeholder="All Types"
            maxW="180px"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="jupyterhub">JupyterHub</option>
            <option value="chat">Chat Agent</option>
            <option value="coding">Coding Agent</option>
            <option value="custom">Custom</option>
          </Select>
        </Flex>
      </Card>

      {/* Loading / Error States */}
      {loading && endpoints.length === 0 && (
        <Flex justify="center" py="40px">
          <Spinner size="xl" color="brand.500" />
        </Flex>
      )}

      {error && (
        <Card p="20px" bg={cardBg}>
          <Text color="red.500">Error loading agents: {error.message}</Text>
        </Card>
      )}

      {/* Agents Grid */}
      {endpoints.length > 0 && (
        <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing="20px">
          {endpoints.map((endpoint) => (
            <Card key={endpoint.id} p="20px" bg={cardBg}>
              <Flex justify="space-between" align="start" mb="12px">
                <Box>
                  <Text fontSize="lg" fontWeight="600" color={textColor}>
                    {endpoint.name}
                  </Text>
                  <Text fontSize="sm" color="gray.500">
                    {endpoint.agentId}
                  </Text>
                </Box>
                <Menu>
                  <MenuButton
                    as={IconButton}
                    icon={<MdMoreVert />}
                    variant="ghost"
                    size="sm"
                  />
                  <MenuList>
                    <MenuItem
                      icon={<MdKey />}
                      onClick={() => handleRegenerateKey(endpoint)}
                    >
                      Regenerate API Key
                    </MenuItem>
                    <MenuItem
                      icon={<MdDelete />}
                      color="red.500"
                      onClick={() => {
                        setSelectedEndpoint(endpoint);
                        onDeleteOpen();
                      }}
                    >
                      Delete Agent
                    </MenuItem>
                  </MenuList>
                </Menu>
              </Flex>

              <Flex gap="8px" mb="12px">
                <Badge colorScheme={getStatusColor(endpoint.status)}>
                  {endpoint.status}
                </Badge>
                <Badge colorScheme={getHealthColor(endpoint.health)}>
                  {endpoint.health || 'unknown'}
                </Badge>
                <Badge variant="outline">{endpoint.agentType}</Badge>
              </Flex>

              {endpoint.description && (
                <Text fontSize="sm" color="gray.500" mb="12px" noOfLines={2}>
                  {endpoint.description}
                </Text>
              )}

              <Box borderTop="1px solid" borderColor={borderColor} pt="12px">
                <Flex justify="space-between" fontSize="xs" color="gray.500">
                  <Text>Last Heartbeat</Text>
                  <Tooltip label={formatDate(endpoint.lastHeartbeat)}>
                    <Text>{timeAgo(endpoint.lastHeartbeat)}</Text>
                  </Tooltip>
                </Flex>
                <Flex justify="space-between" fontSize="xs" color="gray.500" mt="4px">
                  <Text>Deployment</Text>
                  <Text>{endpoint.deploymentName || 'N/A'}</Text>
                </Flex>
                <Flex justify="space-between" fontSize="xs" color="gray.500" mt="4px">
                  <Text>API Key</Text>
                  <Text fontFamily="mono">{endpoint.apiKeyPrefix}...</Text>
                </Flex>
              </Box>
            </Card>
          ))}
        </SimpleGrid>
      )}

      {/* Empty State */}
      {!loading && endpoints.length === 0 && !error && (
        <Card p="40px" bg={cardBg} textAlign="center">
          <Text fontSize="lg" color={textColor} mb="8px">
            No agents registered yet
          </Text>
          <Text color="gray.500" mb="20px">
            Register your first AI agent to start monitoring and controlling it
          </Text>
          <Button
            variant="brand"
            leftIcon={<Icon as={MdAdd} />}
            onClick={() => router.push('/agents/register')}
          >
            Register Agent
          </Button>
        </Card>
      )}

      {/* Delete Confirmation Modal */}
      <Modal isOpen={isDeleteOpen} onClose={onDeleteClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Delete Agent</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            Are you sure you want to delete <strong>{selectedEndpoint?.name}</strong>? This action cannot be undone.
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

      {/* API Key Modal */}
      <Modal isOpen={isKeyOpen} onClose={() => { onKeyClose(); setNewApiKey(null); }}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>New API Key</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {regenerating ? (
              <Flex justify="center" py="20px">
                <Spinner />
              </Flex>
            ) : newApiKey ? (
              <Box>
                <Text mb="12px" color="gray.500">
                  Copy this API key now. It will only be shown once.
                </Text>
                <Flex
                  bg="gray.100"
                  p="12px"
                  borderRadius="md"
                  fontFamily="mono"
                  fontSize="sm"
                  align="center"
                  justify="space-between"
                >
                  <Text wordBreak="break-all">{newApiKey}</Text>
                  <IconButton
                    aria-label="Copy"
                    icon={<MdCopyAll />}
                    size="sm"
                    ml="8px"
                    onClick={() => copyToClipboard(newApiKey)}
                  />
                </Flex>
              </Box>
            ) : (
              <Text>Generating new API key...</Text>
            )}
          </ModalBody>
          <ModalFooter>
            <Button onClick={() => { onKeyClose(); setNewApiKey(null); }}>
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
