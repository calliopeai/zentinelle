'use client';

import {
  Box,
  Button,
  Flex,
  Heading,
  Icon,
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
  FormHelperText,
  Input,
  Textarea,
  useToast,
  Spinner,
  Code,
  InputGroup,
  InputRightElement,
  Checkbox,
  CheckboxGroup,
  VStack,
  Tooltip,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
} from '@chakra-ui/react';
import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import {
  MdAdd,
  MdMoreVert,
  MdDelete,
  MdBlock,
  MdRefresh,
  MdContentCopy,
  MdVpnKey,
  MdCheck,
  MdWarning,
} from 'react-icons/md';
import Card from 'components/card/Card';
import {
  GET_API_KEYS,
  CREATE_PLATFORM_API_KEY,
  REVOKE_API_KEY,
  DELETE_API_KEY,
} from 'graphql/apiKeys';

interface ApiKey {
  id: string;
  name: string;
  description: string | null;
  status: string;
  scopes: string[];
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  expiresAt: string | null;
}

const AVAILABLE_SCOPES = [
  { value: 'agents:read', label: 'Agents (Read)' },
  { value: 'agents:write', label: 'Agents (Write)' },
  { value: 'policies:read', label: 'Policies (Read)' },
  { value: 'policies:write', label: 'Policies (Write)' },
  { value: 'audit:read', label: 'Audit Logs (Read)' },
  { value: 'models:read', label: 'Models (Read)' },
  { value: 'models:write', label: 'Models (Write)' },
  { value: 'secrets:read', label: 'Secrets (Read)' },
  { value: 'secrets:write', label: 'Secrets (Write)' },
];

function getStatusColor(status: string): string {
  switch (status?.toLowerCase()) {
    case 'active':
      return 'green';
    case 'revoked':
      return 'red';
    case 'expired':
      return 'orange';
    default:
      return 'gray';
  }
}

function formatDate(dateString: string | null): string {
  if (!dateString) return 'Never';
  return new Date(dateString).toLocaleDateString();
}

function timeAgo(dateString: string | null): string {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
  return formatDate(dateString);
}

export default function ApiKeyManager() {
  const toast = useToast();

  const cardBg = useColorModeValue('white', 'navy.800');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.100');

  // Modal states
  const { isOpen: isCreateOpen, onOpen: onCreateOpen, onClose: onCreateClose } = useDisclosure();
  const { isOpen: isKeyOpen, onOpen: onKeyOpen, onClose: onKeyClose } = useDisclosure();
  const { isOpen: isRevokeOpen, onOpen: onRevokeOpen, onClose: onRevokeClose } = useDisclosure();
  const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onClose: onDeleteClose } = useDisclosure();

  // Create form state
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createScopes, setCreateScopes] = useState<string[]>([]);

  // Newly created key (shown once)
  const [newApiKey, setNewApiKey] = useState('');
  const [copied, setCopied] = useState(false);

  // Selected key for revoke/delete
  const [selectedKey, setSelectedKey] = useState<ApiKey | null>(null);

  // Query
  const { data, loading, error, refetch } = useQuery(GET_API_KEYS, {
    fetchPolicy: 'cache-and-network',
  });

  // Mutations
  const [createApiKey, { loading: creating }] = useMutation(CREATE_PLATFORM_API_KEY, {
    onCompleted: (result) => {
      if (result.createPlatformApiKey.ok) {
        setNewApiKey(result.createPlatformApiKey.apiKey);
        resetCreateForm();
        onCreateClose();
        onKeyOpen();
        refetch();
      } else {
        toast({
          title: 'Failed to create API key',
          description: result.createPlatformApiKey.error,
          status: 'error',
        });
      }
    },
    onError: (err) => toast({ title: 'Error', description: err.message, status: 'error' }),
  });

  const [revokeApiKey, { loading: revoking }] = useMutation(REVOKE_API_KEY, {
    onCompleted: (result) => {
      if (result.revokeApiKey.ok) {
        toast({ title: 'API key revoked', status: 'success' });
        refetch();
      } else {
        toast({
          title: 'Failed to revoke API key',
          description: result.revokeApiKey.error,
          status: 'error',
        });
      }
      onRevokeClose();
    },
    onError: (err) => {
      toast({ title: 'Error', description: err.message, status: 'error' });
      onRevokeClose();
    },
  });

  const [deleteApiKey, { loading: deleting }] = useMutation(DELETE_API_KEY, {
    onCompleted: (result) => {
      if (result.deleteApiKey.ok) {
        toast({ title: 'API key deleted', status: 'success' });
        refetch();
      } else {
        toast({
          title: 'Failed to delete API key',
          description: result.deleteApiKey.error,
          status: 'error',
        });
      }
      onDeleteClose();
    },
    onError: (err) => {
      toast({ title: 'Error', description: err.message, status: 'error' });
      onDeleteClose();
    },
  });

  const apiKeys: ApiKey[] = useMemo(() => {
    return data?.apiKeys?.edges?.map((edge: { node: ApiKey }) => edge.node) || [];
  }, [data]);

  const resetCreateForm = () => {
    setCreateName('');
    setCreateDescription('');
    setCreateScopes([]);
  };

  const handleCreate = () => {
    if (!createName.trim()) {
      toast({ title: 'Please enter a name for the API key', status: 'warning' });
      return;
    }
    createApiKey({
      variables: {
        name: createName.trim(),
        description: createDescription.trim() || undefined,
        scopes: createScopes.length > 0 ? createScopes : undefined,
      },
    });
  };

  const handleRevoke = () => {
    if (selectedKey) {
      revokeApiKey({ variables: { id: selectedKey.id } });
    }
  };

  const handleDelete = () => {
    if (selectedKey) {
      deleteApiKey({ variables: { id: selectedKey.id } });
    }
  };

  const handleCopyKey = async () => {
    try {
      await navigator.clipboard.writeText(newApiKey);
      setCopied(true);
      toast({ title: 'API key copied to clipboard', status: 'success', duration: 2000 });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Failed to copy', status: 'error' });
    }
  };

  const handleKeyModalClose = () => {
    setNewApiKey('');
    setCopied(false);
    onKeyClose();
  };

  return (
    <Box>
      {/* Header */}
      <Flex justify="space-between" align="center" mb="20px">
        <Box>
          <Heading size="lg" color={textColor}>
            API Keys
          </Heading>
          <Text fontSize="sm" color="secondaryGray.600">
            Manage platform API keys for programmatic access
          </Text>
        </Box>
        <Flex gap="12px">
          <IconButton
            aria-label="Refresh"
            icon={<MdRefresh />}
            variant="outline"
            onClick={() => refetch()}
            isLoading={loading}
          />
          <Button
            variant="brand"
            leftIcon={<Icon as={MdAdd} />}
            onClick={onCreateOpen}
          >
            Create API Key
          </Button>
        </Flex>
      </Flex>

      {/* Loading State */}
      {loading && apiKeys.length === 0 && (
        <Flex justify="center" py="40px">
          <Spinner size="xl" color="brand.500" />
        </Flex>
      )}

      {/* Error State */}
      {error && (
        <Card p="20px" bg={cardBg}>
          <Text color="red.500">Error loading API keys: {error.message}</Text>
        </Card>
      )}

      {/* Empty State */}
      {!loading && apiKeys.length === 0 && !error && (
        <Card p="40px" bg={cardBg} textAlign="center">
          <Icon as={MdVpnKey} boxSize="48px" color="gray.400" mb="16px" />
          <Text fontSize="lg" color={textColor} mb="8px">
            No API keys created
          </Text>
          <Text color="gray.500" mb="20px">
            Create an API key to access the Zentinelle platform programmatically
          </Text>
          <Button
            variant="brand"
            leftIcon={<Icon as={MdAdd} />}
            onClick={onCreateOpen}
          >
            Create API Key
          </Button>
        </Card>
      )}

      {/* API Keys Table */}
      {apiKeys.length > 0 && (
        <Card p="0" bg={cardBg} overflow="hidden">
          <TableContainer>
            <Table variant="simple">
              <Thead>
                <Tr>
                  <Th>Name</Th>
                  <Th>Key</Th>
                  <Th>Status</Th>
                  <Th>Scopes</Th>
                  <Th>Last Used</Th>
                  <Th>Created</Th>
                  <Th>Expires</Th>
                  <Th></Th>
                </Tr>
              </Thead>
              <Tbody>
                {apiKeys.map((apiKey) => (
                  <Tr key={apiKey.id}>
                    <Td>
                      <Box>
                        <Text fontWeight="600" color={textColor} fontSize="sm">
                          {apiKey.name}
                        </Text>
                        {apiKey.description && (
                          <Text fontSize="xs" color="gray.500" noOfLines={1}>
                            {apiKey.description}
                          </Text>
                        )}
                      </Box>
                    </Td>
                    <Td>
                      <Code fontSize="xs" colorScheme="gray">
                        {apiKey.keyPrefix}...
                      </Code>
                    </Td>
                    <Td>
                      <Badge colorScheme={getStatusColor(apiKey.status)}>
                        {apiKey.status}
                      </Badge>
                    </Td>
                    <Td>
                      {apiKey.scopes && apiKey.scopes.length > 0 ? (
                        <Flex gap="4px" flexWrap="wrap" maxW="200px">
                          {apiKey.scopes.slice(0, 2).map((scope) => (
                            <Badge key={scope} variant="outline" fontSize="xs">
                              {scope}
                            </Badge>
                          ))}
                          {apiKey.scopes.length > 2 && (
                            <Tooltip label={apiKey.scopes.slice(2).join(', ')}>
                              <Badge variant="outline" fontSize="xs" cursor="pointer">
                                +{apiKey.scopes.length - 2}
                              </Badge>
                            </Tooltip>
                          )}
                        </Flex>
                      ) : (
                        <Text fontSize="xs" color="gray.500">All</Text>
                      )}
                    </Td>
                    <Td>
                      <Text fontSize="sm" color="gray.500">
                        {timeAgo(apiKey.lastUsedAt)}
                      </Text>
                    </Td>
                    <Td>
                      <Text fontSize="sm" color="gray.500">
                        {formatDate(apiKey.createdAt)}
                      </Text>
                    </Td>
                    <Td>
                      <Text fontSize="sm" color={apiKey.expiresAt ? textColor : 'gray.500'}>
                        {apiKey.expiresAt ? formatDate(apiKey.expiresAt) : 'Never'}
                      </Text>
                    </Td>
                    <Td>
                      <Menu>
                        <MenuButton
                          as={IconButton}
                          icon={<MdMoreVert />}
                          variant="ghost"
                          size="sm"
                        />
                        <MenuList>
                          {apiKey.status === 'active' && (
                            <MenuItem
                              icon={<MdBlock />}
                              onClick={() => {
                                setSelectedKey(apiKey);
                                onRevokeOpen();
                              }}
                            >
                              Revoke
                            </MenuItem>
                          )}
                          <MenuItem
                            icon={<MdDelete />}
                            color="red.500"
                            onClick={() => {
                              setSelectedKey(apiKey);
                              onDeleteOpen();
                            }}
                          >
                            Delete
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

      {/* Create API Key Modal */}
      <Modal isOpen={isCreateOpen} onClose={() => { resetCreateForm(); onCreateClose(); }} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Create API Key</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing="16px" align="stretch">
              <FormControl isRequired>
                <FormLabel>Name</FormLabel>
                <Input
                  placeholder="e.g. Production Pipeline"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                />
                <FormHelperText>A descriptive name to identify this key</FormHelperText>
              </FormControl>

              <FormControl>
                <FormLabel>Description</FormLabel>
                <Textarea
                  placeholder="What is this key used for?"
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  rows={2}
                />
              </FormControl>

              <FormControl>
                <FormLabel>Scopes</FormLabel>
                <FormHelperText mb="8px">
                  Select the permissions for this key. Leave empty to grant all scopes.
                </FormHelperText>
                <CheckboxGroup
                  value={createScopes}
                  onChange={(values) => setCreateScopes(values as string[])}
                >
                  <VStack align="start" spacing="8px">
                    {AVAILABLE_SCOPES.map((scope) => (
                      <Checkbox key={scope.value} value={scope.value} colorScheme="brand">
                        <Text fontSize="sm">{scope.label}</Text>
                      </Checkbox>
                    ))}
                  </VStack>
                </CheckboxGroup>
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={() => { resetCreateForm(); onCreateClose(); }}>
              Cancel
            </Button>
            <Button variant="brand" onClick={handleCreate} isLoading={creating}>
              Create Key
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Show API Key Modal (shown once after creation) */}
      <Modal isOpen={isKeyOpen} onClose={handleKeyModalClose} closeOnOverlayClick={false} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <Flex align="center" gap="8px">
              <Icon as={MdWarning} color="orange.500" />
              Save Your API Key
            </Flex>
          </ModalHeader>
          <ModalBody>
            <Text mb="16px" color="orange.500" fontWeight="500">
              This is the only time the full API key will be shown. Copy it now and store it securely.
            </Text>
            <InputGroup size="lg" mb="16px">
              <Input
                value={newApiKey}
                isReadOnly
                fontFamily="mono"
                fontSize="sm"
                pr="60px"
              />
              <InputRightElement width="60px">
                <IconButton
                  aria-label="Copy API key"
                  icon={copied ? <MdCheck /> : <MdContentCopy />}
                  size="sm"
                  variant="ghost"
                  colorScheme={copied ? 'green' : 'gray'}
                  onClick={handleCopyKey}
                />
              </InputRightElement>
            </InputGroup>
            <Text fontSize="sm" color="gray.500">
              If you lose this key, you will need to create a new one. Revoke this key immediately if it is compromised.
            </Text>
          </ModalBody>
          <ModalFooter>
            <Button variant="brand" onClick={handleKeyModalClose}>
              Done
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Revoke Confirmation Modal */}
      <Modal isOpen={isRevokeOpen} onClose={onRevokeClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Revoke API Key</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text mb="12px">
              Are you sure you want to revoke <strong>{selectedKey?.name}</strong>?
            </Text>
            <Text color="orange.500" fontSize="sm">
              This key will immediately stop working. Any integrations using this key will lose access.
            </Text>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onRevokeClose}>
              Cancel
            </Button>
            <Button colorScheme="orange" onClick={handleRevoke} isLoading={revoking}>
              Revoke Key
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={isDeleteOpen} onClose={onDeleteClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Delete API Key</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text mb="12px">
              Are you sure you want to permanently delete <strong>{selectedKey?.name}</strong>?
            </Text>
            <Text color="red.500" fontSize="sm">
              This action cannot be undone. The key and all associated usage data will be permanently removed.
            </Text>
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
    </Box>
  );
}
