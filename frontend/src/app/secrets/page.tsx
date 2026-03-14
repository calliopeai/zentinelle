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
  useToast,
  Progress,
  Tooltip,
} from '@chakra-ui/react';
import { useQuery, useMutation } from '@apollo/client';
import { useState } from 'react';
import { MdAdd, MdSearch, MdMoreVert, MdRefresh, MdDelete, MdEdit, MdRotate90DegreesCcw, MdKey } from 'react-icons/md';
import { useRouter } from 'next/navigation';
import Card from 'components/card/Card';
import { GET_SECRET_BUNDLES, DELETE_SECRET_BUNDLE, ROTATE_SECRET_BUNDLE } from 'graphql/secrets';

interface SecretBundle {
  id: string;
  name: string;
  slug: string;
  description: string;
  secretType: string;
  providerConfigs: string;
  rotationEnabled: boolean;
  rotationIntervalDays: number;
  lastRotated: string;
  nextRotation: string;
  enabledProviders: string[];
  createdAt: string;
  updatedAt: string;
}

function getSecretTypeColor(type: string): string {
  switch (type?.toLowerCase()) {
    case 'api_key':
      return 'blue';
    case 'oauth':
      return 'green';
    case 'database':
      return 'purple';
    case 'certificate':
      return 'orange';
    case 'ssh':
      return 'cyan';
    case 'token':
      return 'pink';
    default:
      return 'gray';
  }
}

function formatDate(dateString: string): string {
  if (!dateString) return 'Never';
  return new Date(dateString).toLocaleDateString();
}

function getDaysUntilRotation(nextRotation: string): number | null {
  if (!nextRotation) return null;
  const next = new Date(nextRotation);
  const now = new Date();
  const days = Math.ceil((next.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return days;
}

function getRotationColor(days: number | null): string {
  if (days === null) return 'gray';
  if (days < 0) return 'red';
  if (days < 7) return 'orange';
  if (days < 30) return 'yellow';
  return 'green';
}

export default function SecretsPage() {
  const router = useRouter();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [selectedBundle, setSelectedBundle] = useState<SecretBundle | null>(null);

  const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onClose: onDeleteClose } = useDisclosure();

  const cardBg = useColorModeValue('white', 'navy.800');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.100');

  const { data, loading, error, refetch } = useQuery(GET_SECRET_BUNDLES, {
    variables: {
      search: search || undefined,
      secretType: typeFilter || undefined,
      first: 50,
    },
    fetchPolicy: 'cache-and-network',
  });

  const [deleteBundle, { loading: deleting }] = useMutation(DELETE_SECRET_BUNDLE, {
    onCompleted: (result) => {
      if (result.deleteSecretBundle.success) {
        toast({ title: 'Secret bundle deleted', status: 'success' });
        refetch();
      } else {
        toast({ title: 'Failed to delete secret bundle', description: result.deleteSecretBundle.errors?.join(', '), status: 'error' });
      }
      onDeleteClose();
    },
  });

  const [rotateBundle, { loading: rotating }] = useMutation(ROTATE_SECRET_BUNDLE, {
    onCompleted: (result) => {
      if (result.rotateSecretBundle.success) {
        toast({ title: 'Secrets rotated successfully', status: 'success' });
        refetch();
      } else {
        toast({ title: 'Failed to rotate secrets', description: result.rotateSecretBundle.errors?.join(', '), status: 'error' });
      }
    },
  });

  const bundles: SecretBundle[] = data?.secretBundles?.edges?.map((edge: { node: SecretBundle }) => edge.node) || [];

  const handleDelete = () => {
    if (selectedBundle) {
      deleteBundle({ variables: { secretBundleId: selectedBundle.id } });
    }
  };

  const handleRotate = (bundle: SecretBundle) => {
    rotateBundle({ variables: { secretBundleId: bundle.id } });
  };

  return (
    <Box pt={{ base: '130px', md: '80px', xl: '80px' }}>
      {/* Header */}
      <Flex justify="space-between" align="center" mb="20px">
        <Box>
          <Heading size="lg" color={textColor}>
            Secrets Management
          </Heading>
          <Text fontSize="sm" color="secondaryGray.600">
            Manage API keys, credentials, and secure configurations
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
          <Button
            variant="brand"
            leftIcon={<Icon as={MdAdd} />}
            onClick={() => router.push('/zentinelle/secrets/create')}
          >
            Add Secret Bundle
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
              placeholder="Search secrets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </InputGroup>
          <Select
            placeholder="All Types"
            maxW="180px"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="api_key">API Key</option>
            <option value="oauth">OAuth</option>
            <option value="database">Database</option>
            <option value="certificate">Certificate</option>
            <option value="ssh">SSH Key</option>
            <option value="token">Token</option>
          </Select>
        </Flex>
      </Card>

      {/* Loading / Error States */}
      {loading && bundles.length === 0 && (
        <Flex justify="center" py="40px">
          <Spinner size="xl" color="brand.500" />
        </Flex>
      )}

      {error && (
        <Card p="20px" bg={cardBg}>
          <Text color="red.500">Error loading secrets: {error.message}</Text>
        </Card>
      )}

      {/* Secrets Grid */}
      {bundles.length > 0 && (
        <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing="20px">
          {bundles.map((bundle) => {
            const daysUntilRotation = getDaysUntilRotation(bundle.nextRotation);
            return (
              <Card key={bundle.id} p="20px" bg={cardBg}>
                <Flex justify="space-between" align="start" mb="12px">
                  <Flex align="center" gap="12px">
                    <Flex
                      w="40px"
                      h="40px"
                      bg="brand.500"
                      borderRadius="12px"
                      align="center"
                      justify="center"
                    >
                      <Icon as={MdKey} color="white" boxSize="20px" />
                    </Flex>
                    <Box>
                      <Text fontSize="lg" fontWeight="600" color={textColor}>
                        {bundle.name}
                      </Text>
                      <Text fontSize="xs" color="gray.500" fontFamily="mono">
                        {bundle.slug}
                      </Text>
                    </Box>
                  </Flex>
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
                        onClick={() => router.push(`/zentinelle/secrets/${bundle.id}/edit`)}
                      >
                        Edit
                      </MenuItem>
                      <MenuItem
                        icon={<MdRotate90DegreesCcw />}
                        onClick={() => handleRotate(bundle)}
                        isDisabled={rotating}
                      >
                        Rotate Now
                      </MenuItem>
                      <MenuItem
                        icon={<MdDelete />}
                        color="red.500"
                        onClick={() => {
                          setSelectedBundle(bundle);
                          onDeleteOpen();
                        }}
                      >
                        Delete
                      </MenuItem>
                    </MenuList>
                  </Menu>
                </Flex>

                <Flex gap="8px" mb="12px">
                  <Badge colorScheme={getSecretTypeColor(bundle.secretType)}>
                    {bundle.secretType?.replace(/_/g, ' ')}
                  </Badge>
                  {bundle.rotationEnabled && (
                    <Badge colorScheme="green">Auto-Rotate</Badge>
                  )}
                </Flex>

                {bundle.description && (
                  <Text fontSize="sm" color="gray.500" mb="12px" noOfLines={2}>
                    {bundle.description}
                  </Text>
                )}

                {/* Enabled Providers */}
                {bundle.enabledProviders && bundle.enabledProviders.length > 0 && (
                  <Flex gap="4px" mb="12px" flexWrap="wrap">
                    {bundle.enabledProviders.map((provider) => (
                      <Badge key={provider} variant="outline" fontSize="xs">
                        {provider}
                      </Badge>
                    ))}
                  </Flex>
                )}

                {/* Rotation Status */}
                {bundle.rotationEnabled && (
                  <Box mb="12px">
                    <Flex justify="space-between" fontSize="xs" mb="4px">
                      <Text color="gray.500">Next rotation</Text>
                      <Text color={getRotationColor(daysUntilRotation) + '.500'}>
                        {daysUntilRotation !== null
                          ? daysUntilRotation < 0
                            ? 'Overdue'
                            : `${daysUntilRotation} days`
                          : 'N/A'}
                      </Text>
                    </Flex>
                    <Progress
                      value={daysUntilRotation !== null ? Math.max(0, Math.min(100, (daysUntilRotation / bundle.rotationIntervalDays) * 100)) : 0}
                      size="xs"
                      colorScheme={getRotationColor(daysUntilRotation)}
                      borderRadius="full"
                    />
                  </Box>
                )}

                <Box borderTop="1px solid" borderColor={borderColor} pt="12px">
                  <Flex justify="space-between" fontSize="xs" color="gray.500">
                    <Text>Last Rotated</Text>
                    <Text>{formatDate(bundle.lastRotated)}</Text>
                  </Flex>
                  <Flex justify="space-between" fontSize="xs" color="gray.500" mt="4px">
                    <Text>Created</Text>
                    <Text>{formatDate(bundle.createdAt)}</Text>
                  </Flex>
                </Box>
              </Card>
            );
          })}
        </SimpleGrid>
      )}

      {/* Empty State */}
      {!loading && bundles.length === 0 && !error && (
        <Card p="40px" bg={cardBg} textAlign="center">
          <Icon as={MdKey} boxSize="48px" color="gray.400" mb="16px" />
          <Text fontSize="lg" color={textColor} mb="8px">
            No secret bundles configured
          </Text>
          <Text color="gray.500" mb="20px">
            Create a secret bundle to securely manage API keys and credentials
          </Text>
          <Button
            variant="brand"
            leftIcon={<Icon as={MdAdd} />}
            onClick={() => router.push('/zentinelle/secrets/create')}
          >
            Add Secret Bundle
          </Button>
        </Card>
      )}

      {/* Delete Confirmation Modal */}
      <Modal isOpen={isDeleteOpen} onClose={onDeleteClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Delete Secret Bundle</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text mb="12px">
              Are you sure you want to delete <strong>{selectedBundle?.name}</strong>?
            </Text>
            <Text color="red.500" fontSize="sm">
              Warning: This will revoke all secrets in this bundle and may break integrations that depend on them.
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
