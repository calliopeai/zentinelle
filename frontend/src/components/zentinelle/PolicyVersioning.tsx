'use client';

import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Icon,
  Button,
  Select,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
  IconButton,
  Tooltip,
  useColorModeValue,
  useToast,
  Flex,
  Divider,
  Code,
  Avatar,
  Alert,
  AlertIcon,
  AlertDialog,
  AlertDialogBody,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogContent,
  AlertDialogOverlay,
  Spinner,
} from '@chakra-ui/react';
import { useQuery } from '@apollo/client';
import { useState, useMemo, useRef } from 'react';
import {
  MdHistory,
  MdCompare,
  MdRestore,
  MdVisibility,
  MdPerson,
  MdAdd,
  MdEdit,
  MdDelete,
  MdContentCopy,
  MdCheck,
  MdClose,
  MdSchedule,
  MdCode,
  MdRefresh,
} from 'react-icons/md';
import Card from 'components/card/Card';
import { GET_POLICY_REVISIONS } from 'graphql/policies';

interface PolicyRevisionData {
  id: string;
  version: number;
  name: string;
  policyType: string;
  enforcement: string;
  config: Record<string, any>;
  scopeType: string;
  enabled: boolean;
  priority: number;
  changedBy: string;
  changeSummary: string;
  createdAt: string;
}

interface PolicyVersion {
  id: string;
  version: number;
  policyId: string;
  policyName: string;
  policyType: string;
  config: Record<string, any>;
  changeType: 'created' | 'updated' | 'deleted';
  changeSummary: string;
  changedBy: string;
  changedByEmail: string;
  changedAt: string;
  commitMessage?: string;
  previousVersion?: number;
}

interface DiffLine {
  type: 'unchanged' | 'added' | 'removed';
  content: string;
  lineNumber?: number;
}

interface PolicyVersioningProps {
  policyId?: string;
  policyName?: string;
}

// Convert PolicyRevision to PolicyVersion
function revisionToVersion(rev: PolicyRevisionData, index: number, total: number): PolicyVersion {
  return {
    id: rev.id,
    version: rev.version,
    policyId: '',
    policyName: rev.name,
    policyType: rev.policyType,
    config: rev.config || {},
    changeType: index === total - 1 ? 'created' : 'updated',
    changeSummary: rev.changeSummary || '',
    changedBy: rev.changedBy || 'System',
    changedByEmail: '',
    changedAt: rev.createdAt,
    previousVersion: rev.version > 1 ? rev.version - 1 : undefined,
  };
}

// Generate diff between two configs
function generateDiff(oldConfig: Record<string, any>, newConfig: Record<string, any>): DiffLine[] {
  const oldLines = JSON.stringify(oldConfig, null, 2).split('\n');
  const newLines = JSON.stringify(newConfig, null, 2).split('\n');
  const diff: DiffLine[] = [];

  const maxLength = Math.max(oldLines.length, newLines.length);

  for (let i = 0; i < maxLength; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];

    if (oldLine === newLine) {
      diff.push({ type: 'unchanged', content: newLine || '', lineNumber: i + 1 });
    } else {
      if (oldLine !== undefined && !newLines.includes(oldLine)) {
        diff.push({ type: 'removed', content: oldLine, lineNumber: i + 1 });
      }
      if (newLine !== undefined && !oldLines.includes(newLine)) {
        diff.push({ type: 'added', content: newLine, lineNumber: i + 1 });
      }
    }
  }

  return diff;
}

function formatDateTime(isoString: string): string {
  return new Date(isoString).toLocaleString();
}

function formatTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

export default function PolicyVersioning({ policyId, policyName }: PolicyVersioningProps) {
  const cardBg = useColorModeValue('white', 'navy.800');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.200');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const subtleText = useColorModeValue('gray.500', 'gray.400');
  const codeBg = useColorModeValue('gray.50', 'whiteAlpha.100');
  const addedBg = useColorModeValue('green.50', 'green.900');
  const removedBg = useColorModeValue('red.50', 'red.900');
  const addedColor = useColorModeValue('green.700', 'green.200');
  const removedColor = useColorModeValue('red.700', 'red.200');
  const toast = useToast();

  const [selectedVersion, setSelectedVersion] = useState<PolicyVersion | null>(null);
  const [compareVersions, setCompareVersions] = useState<[PolicyVersion | null, PolicyVersion | null]>([null, null]);

  const { isOpen: isViewOpen, onOpen: onViewOpen, onClose: onViewClose } = useDisclosure();
  const { isOpen: isDiffOpen, onOpen: onDiffOpen, onClose: onDiffClose } = useDisclosure();
  const { isOpen: isRollbackOpen, onOpen: onRollbackOpen, onClose: onRollbackClose } = useDisclosure();
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Fetch version history from policy revisions
  const { data: versionsData, loading: versionsLoading, refetch } = useQuery(GET_POLICY_REVISIONS, {
    variables: { policyId },
    skip: !policyId,
    fetchPolicy: 'cache-and-network',
  });

  // Convert revisions to PolicyVersion format
  const versions = useMemo<PolicyVersion[]>(() => {
    const revisions: PolicyRevisionData[] = versionsData?.policyRevisions || [];
    const total = revisions.length;
    return revisions.map((rev, idx) => revisionToVersion(rev, idx, total));
  }, [versionsData]);

  const currentVersion = versions[0];
  const displayName = currentVersion?.policyName || policyName || 'Policy';

  const handleViewVersion = (version: PolicyVersion) => {
    setSelectedVersion(version);
    onViewOpen();
  };

  const handleCompare = (versionA: PolicyVersion, versionB: PolicyVersion) => {
    setCompareVersions([versionA, versionB]);
    onDiffOpen();
  };

  const handleRollback = (version: PolicyVersion) => {
    setSelectedVersion(version);
    onRollbackOpen();
  };

  const confirmRollback = () => {
    toast({
      title: 'Policy Rolled Back',
      description: `Rolled back to version ${selectedVersion?.version}`,
      status: 'success',
      duration: 3000,
    });
    onRollbackClose();
  };

  const copyConfig = (config: Record<string, any>) => {
    navigator.clipboard.writeText(JSON.stringify(config, null, 2));
    toast({ title: 'Copied to clipboard', status: 'info', duration: 2000 });
  };

  const diff = useMemo(() => {
    if (compareVersions[0] && compareVersions[1]) {
      return generateDiff(compareVersions[0].config, compareVersions[1].config);
    }
    return [];
  }, [compareVersions]);

  const changeTypeColors: Record<string, string> = {
    created: 'green',
    updated: 'blue',
    deleted: 'red',
  };

  const changeTypeIcons: Record<string, any> = {
    created: MdAdd,
    updated: MdEdit,
    deleted: MdDelete,
  };

  const loading = versionsLoading;

  if (!policyId) {
    return (
      <Card p="40px" bg={cardBg} textAlign="center">
        <Icon as={MdHistory} boxSize="48px" color="gray.400" mb="16px" />
        <Text color={subtleText}>Select a policy to view its version history</Text>
      </Card>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Card p="20px" bg={cardBg} mb="20px">
        <HStack justify="space-between" flexWrap="wrap">
          <VStack align="start" spacing="4px">
            <HStack spacing="8px">
              <Icon as={MdHistory} color="brand.500" />
              <Text fontSize="lg" fontWeight="600" color={textColor}>
                Version History
              </Text>
            </HStack>
            <Text fontSize="sm" color={subtleText}>
              {displayName} • {versions.length} versions
            </Text>
          </VStack>
          <HStack spacing="8px">
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<MdRefresh />}
              onClick={() => refetch()}
              isLoading={versionsLoading}
            >
              Refresh
            </Button>
            <Button
              size="sm"
              variant="outline"
              leftIcon={<MdCompare />}
              onClick={() => {
                if (versions.length >= 2) {
                  handleCompare(versions[1], versions[0]);
                }
              }}
              isDisabled={versions.length < 2}
            >
              Compare Latest
            </Button>
            <Button size="sm" variant="outline" leftIcon={<MdCode />}>
              Export YAML
            </Button>
          </HStack>
        </HStack>
      </Card>

      {/* Loading State */}
      {loading && (
        <Flex justify="center" py="60px">
          <Spinner size="lg" color="brand.500" />
        </Flex>
      )}

      {/* Empty State */}
      {!loading && versions.length === 0 && (
        <Card p="40px" bg={cardBg} textAlign="center">
          <Icon as={MdHistory} boxSize="48px" color="gray.400" mb="16px" />
          <Text color={subtleText}>No version history available for this policy</Text>
        </Card>
      )}

      {/* Version Timeline */}
      {!loading && versions.length > 0 && (
        <Card p="20px" bg={cardBg}>
          <VStack align="stretch" spacing="0">
            {versions.map((version, idx) => {
              const isLatest = idx === 0;
              const previousVersion = versions[idx + 1];

              return (
                <Box key={version.id} position="relative">
                  {/* Timeline Line */}
                  {idx < versions.length - 1 && (
                    <Box
                      position="absolute"
                      left="15px"
                      top="32px"
                      bottom="-8px"
                      width="2px"
                      bg={borderColor}
                    />
                  )}

                  <HStack spacing="16px" py="16px" align="start">
                    {/* Version Indicator */}
                    <Flex
                      w="32px"
                      h="32px"
                      bg={isLatest ? 'brand.500' : `${changeTypeColors[version.changeType]}.500`}
                      borderRadius="full"
                      align="center"
                      justify="center"
                      flexShrink={0}
                      zIndex={1}
                    >
                      <Icon as={changeTypeIcons[version.changeType]} color="white" boxSize="16px" />
                    </Flex>

                    {/* Version Details */}
                    <Box flex="1">
                      <HStack spacing="8px" mb="4px" flexWrap="wrap">
                        <Badge colorScheme={isLatest ? 'brand' : 'gray'} fontSize="10px">
                          v{version.version}
                        </Badge>
                        {isLatest && (
                          <Badge colorScheme="green" fontSize="10px">current</Badge>
                        )}
                        <Badge colorScheme={changeTypeColors[version.changeType]} fontSize="10px">
                          {version.changeType}
                        </Badge>
                        <Text fontSize="xs" color={subtleText}>
                          {formatTimeAgo(version.changedAt)}
                        </Text>
                      </HStack>

                      <Text fontSize="sm" fontWeight="500" color={textColor} mb="4px">
                        {version.changeSummary}
                      </Text>

                      {version.commitMessage && (
                        <HStack spacing="4px" mb="8px">
                          <Icon as={MdCode} color="gray.400" boxSize="14px" />
                          <Text fontSize="xs" color={subtleText} fontFamily="mono">
                            {version.commitMessage}
                          </Text>
                        </HStack>
                      )}

                      <HStack spacing="8px" mb="8px">
                        <Avatar size="xs" name={version.changedBy} />
                        <Text fontSize="xs" color={subtleText}>
                          {version.changedBy}
                        </Text>
                        <Text fontSize="xs" color={subtleText}>•</Text>
                        <Text fontSize="xs" color={subtleText}>
                          {formatDateTime(version.changedAt)}
                        </Text>
                      </HStack>

                      <HStack spacing="8px">
                        <Button
                          size="xs"
                          variant="ghost"
                          leftIcon={<MdVisibility />}
                          onClick={() => handleViewVersion(version)}
                        >
                          View
                        </Button>
                        {previousVersion && (
                          <Button
                            size="xs"
                            variant="ghost"
                            leftIcon={<MdCompare />}
                            onClick={() => handleCompare(previousVersion, version)}
                          >
                            Diff
                          </Button>
                        )}
                        {!isLatest && (
                          <Button
                            size="xs"
                            variant="ghost"
                            leftIcon={<MdRestore />}
                            colorScheme="orange"
                            onClick={() => handleRollback(version)}
                          >
                            Rollback
                          </Button>
                        )}
                      </HStack>
                    </Box>
                  </HStack>

                  {idx < versions.length - 1 && <Divider />}
                </Box>
              );
            })}
          </VStack>
        </Card>
      )}

      {/* View Version Modal */}
      <Modal isOpen={isViewOpen} onClose={onViewClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <HStack spacing="8px">
              <Text>Version {selectedVersion?.version}</Text>
              <Badge colorScheme={changeTypeColors[selectedVersion?.changeType || 'updated']}>
                {selectedVersion?.changeType}
              </Badge>
            </HStack>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {selectedVersion && (
              <VStack align="stretch" spacing="16px">
                <Box>
                  <Text fontSize="xs" color={subtleText} textTransform="uppercase" mb="4px">
                    Change Summary
                  </Text>
                  <Text fontSize="sm">{selectedVersion.changeSummary}</Text>
                </Box>

                <Box>
                  <Text fontSize="xs" color={subtleText} textTransform="uppercase" mb="4px">
                    Changed By
                  </Text>
                  <HStack spacing="8px">
                    <Avatar size="sm" name={selectedVersion.changedBy} />
                    <Box>
                      <Text fontSize="sm">{selectedVersion.changedBy}</Text>
                      <Text fontSize="xs" color={subtleText}>{selectedVersion.changedByEmail}</Text>
                    </Box>
                  </HStack>
                </Box>

                <Box>
                  <HStack justify="space-between" mb="8px">
                    <Text fontSize="xs" color={subtleText} textTransform="uppercase">
                      Configuration
                    </Text>
                    <IconButton
                      aria-label="Copy"
                      icon={<MdContentCopy />}
                      size="xs"
                      variant="ghost"
                      onClick={() => copyConfig(selectedVersion.config)}
                    />
                  </HStack>
                  <Code
                    display="block"
                    p="12px"
                    borderRadius="md"
                    fontSize="xs"
                    whiteSpace="pre-wrap"
                    bg={codeBg}
                  >
                    {JSON.stringify(selectedVersion.config, null, 2)}
                  </Code>
                </Box>
              </VStack>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={onViewClose}>Close</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Diff Modal */}
      <Modal isOpen={isDiffOpen} onClose={onDiffClose} size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            Compare Versions
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {compareVersions[0] && compareVersions[1] && (
              <VStack align="stretch" spacing="16px">
                <HStack justify="space-between">
                  <Badge colorScheme="red" fontSize="sm" px="12px" py="4px">
                    v{compareVersions[0].version} (older)
                  </Badge>
                  <Icon as={MdCompare} color="gray.400" />
                  <Badge colorScheme="green" fontSize="sm" px="12px" py="4px">
                    v{compareVersions[1].version} (newer)
                  </Badge>
                </HStack>

                <Box
                  border="1px solid"
                  borderColor={borderColor}
                  borderRadius="md"
                  overflow="hidden"
                >
                  {diff.map((line, idx) => (
                    <HStack
                      key={idx}
                      spacing="0"
                      bg={
                        line.type === 'added' ? addedBg :
                        line.type === 'removed' ? removedBg :
                        undefined
                      }
                      borderBottom={idx < diff.length - 1 ? '1px solid' : undefined}
                      borderColor={borderColor}
                    >
                      <Box
                        w="40px"
                        p="4px 8px"
                        textAlign="right"
                        bg={codeBg}
                        borderRight="1px solid"
                        borderColor={borderColor}
                      >
                        <Text fontSize="xs" color={subtleText} fontFamily="mono">
                          {line.lineNumber}
                        </Text>
                      </Box>
                      <Box w="24px" textAlign="center">
                        {line.type === 'added' && (
                          <Icon as={MdAdd} color={addedColor} boxSize="14px" />
                        )}
                        {line.type === 'removed' && (
                          <Icon as={MdClose} color={removedColor} boxSize="14px" />
                        )}
                      </Box>
                      <Text
                        flex="1"
                        p="4px 8px"
                        fontSize="xs"
                        fontFamily="mono"
                        color={
                          line.type === 'added' ? addedColor :
                          line.type === 'removed' ? removedColor :
                          textColor
                        }
                      >
                        {line.content}
                      </Text>
                    </HStack>
                  ))}
                </Box>

                <HStack spacing="16px">
                  <HStack spacing="4px">
                    <Box w="12px" h="12px" bg={addedBg} borderRadius="sm" />
                    <Text fontSize="xs" color={subtleText}>Added</Text>
                  </HStack>
                  <HStack spacing="4px">
                    <Box w="12px" h="12px" bg={removedBg} borderRadius="sm" />
                    <Text fontSize="xs" color={subtleText}>Removed</Text>
                  </HStack>
                </HStack>
              </VStack>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={onDiffClose}>Close</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Rollback Confirmation */}
      <AlertDialog
        isOpen={isRollbackOpen}
        leastDestructiveRef={cancelRef}
        onClose={onRollbackClose}
      >
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader fontSize="lg" fontWeight="bold">
              Rollback Policy
            </AlertDialogHeader>
            <AlertDialogBody>
              <Alert status="warning" mb="16px">
                <AlertIcon />
                This will create a new version with the configuration from v{selectedVersion?.version}.
              </Alert>
              <Text>
                Are you sure you want to rollback "{displayName}" to version {selectedVersion?.version}?
              </Text>
              <Text fontSize="sm" color={subtleText} mt="8px">
                {selectedVersion?.changeSummary}
              </Text>
            </AlertDialogBody>
            <AlertDialogFooter>
              <Button ref={cancelRef} onClick={onRollbackClose}>
                Cancel
              </Button>
              <Button colorScheme="orange" onClick={confirmRollback} ml={3}>
                Rollback
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Box>
  );
}
