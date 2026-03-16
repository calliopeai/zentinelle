'use client';

import {
  Box,
  VStack,
  HStack,
  SimpleGrid,
  Text,
  Badge,
  Icon,
  Button,
  Input,
  InputGroup,
  InputLeftElement,
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
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  useColorModeValue,
  Flex,
  Divider,
  Tag,
  TagLabel,
  Wrap,
  WrapItem,
  Progress,
  Spinner,
  Alert,
  AlertIcon,
  FormControl,
  FormLabel,
  Textarea,
  useToast,
} from '@chakra-ui/react';
import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import {
  MdSearch,
  MdAdd,
  MdMoreVert,
  MdWarning,
  MdError,
  MdCheckCircle,
  MdAccessTime,
  MdPerson,
  MdSmartToy,
  MdPolicy,
  MdTimeline,
  MdAssignment,
  MdBugReport,
  MdSecurity,
} from 'react-icons/md';
import Card from 'components/card/Card';
import { GET_INCIDENTS, GET_RISK_STATS, CREATE_INCIDENT, UPDATE_INCIDENT } from 'graphql/risk';

interface Incident {
  id: string;
  title: string;
  description: string;
  incidentType: string;
  incidentTypeDisplay: string;
  severity: string;
  severityDisplay: string;
  status: string;
  statusDisplay: string;
  slaStatus: string;
  timeToAcknowledgeSeconds: number | null;
  timeToResolveSeconds: number | null;
  assignedToName: string | null;
  reportedByName: string | null;
  endpointName: string | null;
  deploymentName: string | null;
  relatedRiskName: string | null;
  triggeringPolicyName: string | null;
  affectedUser: string;
  affectedUserCount: number;
  rootCause: string;
  impactAssessment: string;
  resolution: string;
  remediationActions: string[];
  lessonsLearned: string;
  occurredAt: string;
  detectedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  tags: string[];
  timelineEvents: Array<{
    timestamp: string;
    type: string;
    description: string;
    user: string | null;
  }>;
  createdAt: string;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return 'N/A';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

function formatDateTime(isoString: string): string {
  return new Date(isoString).toLocaleString();
}

export default function IncidentManagement() {
  const cardBg = useColorModeValue('white', 'navy.800');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.200');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const subtleText = useColorModeValue('gray.500', 'gray.400');
  const hoverBg = useColorModeValue('gray.50', 'whiteAlpha.100');

  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);

  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isOpen: isCreateOpen, onOpen: onCreateOpen, onClose: onCreateClose } = useDisclosure();
  const { isOpen: isStatusOpen, onOpen: onStatusOpen, onClose: onStatusClose } = useDisclosure();
  const toast = useToast();
  const [newStatus, setNewStatus] = useState('');

  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createSeverity, setCreateSeverity] = useState('medium');
  const [createType, setCreateType] = useState('policy_violation');

  const [updateIncident, { loading: updating }] = useMutation(UPDATE_INCIDENT, {
    onCompleted: (result) => {
      if (result.updateIncident?.success) {
        toast({ title: 'Status updated', status: 'success', duration: 2000 });
        onStatusClose();
        refetch();
      } else {
        toast({ title: 'Failed to update status', description: result.updateIncident?.errors?.join(', '), status: 'error' });
      }
    },
  });

  const [createIncident, { loading: creating }] = useMutation(CREATE_INCIDENT, {
    onCompleted: (result) => {
      if (result.createIncident?.success) {
        toast({ title: 'Incident reported', status: 'success', duration: 2000 });
        onCreateClose();
        setCreateTitle(''); setCreateDescription(''); setCreateSeverity('medium'); setCreateType('policy_violation');
        refetch();
      } else {
        toast({ title: 'Failed to report incident', description: result.createIncident?.errors?.join(', '), status: 'error' });
      }
    },
  });

  // Fetch incidents
  const { data, loading, error, refetch } = useQuery(GET_INCIDENTS, {
    variables: {
      search: search || undefined,
      severity: severityFilter || undefined,
      status: statusFilter || undefined,
      first: 100,
    },
    pollInterval: 30000,
  });

  // Fetch stats
  const { data: statsData } = useQuery(GET_RISK_STATS, {
    pollInterval: 60000,
  });

  // Transform data
  const incidents: Incident[] = useMemo(() => {
    if (!data?.incidents?.edges) return [];
    return data.incidents.edges.map((edge: { node: Incident }) => edge.node);
  }, [data]);

  // Stats from backend
  const stats = useMemo(() => {
    const riskStats = statsData?.riskStats;
    if (riskStats) {
      return {
        total: riskStats.totalIncidents || 0,
        open: riskStats.openIncidents || 0,
        today: riskStats.incidentsToday || 0,
        slaMet: riskStats.slaMetCount || 0,
        slaBreached: riskStats.slaBreachedCount || 0,
      };
    }
    const open = incidents.filter((i) => !['resolved', 'closed'].includes(i.status)).length;
    return { total: incidents.length, open, today: 0, slaMet: 0, slaBreached: 0 };
  }, [incidents, statsData]);

  const handleViewIncident = (incident: Incident) => {
    setSelectedIncident(incident);
    onOpen();
  };

  const severityColors: Record<string, string> = {
    low: 'gray',
    medium: 'yellow',
    high: 'orange',
    critical: 'red',
  };

  const severityIcons: Record<string, React.ElementType> = {
    low: MdAssignment,
    medium: MdWarning,
    high: MdError,
    critical: MdBugReport,
  };

  const statusColors: Record<string, string> = {
    open: 'red',
    investigating: 'orange',
    mitigating: 'yellow',
    resolved: 'green',
    closed: 'gray',
  };

  const slaColors: Record<string, string> = {
    met: 'green',
    on_track: 'blue',
    at_risk: 'orange',
    breached: 'red',
  };

  const typeIcons: Record<string, React.ElementType> = {
    policy_violation: MdPolicy,
    security_breach: MdSecurity,
    data_leak: MdBugReport,
    service_disruption: MdError,
    compliance_breach: MdPolicy,
    cost_overrun: MdWarning,
    harmful_output: MdWarning,
    other: MdAssignment,
  };

  if (error) {
    return (
      <Alert status="error">
        <AlertIcon />
        Failed to load incidents: {error.message}
      </Alert>
    );
  }

  return (
    <Box>
      {/* Stats */}
      <SimpleGrid columns={{ base: 2, md: 4 }} spacing="16px" mb="20px">
        <Card p="20px" bg={cardBg}>
          <HStack spacing="12px">
            <Flex
              w="40px"
              h="40px"
              bg="brand.500"
              borderRadius="10px"
              align="center"
              justify="center"
            >
              <Icon as={MdBugReport} color="white" boxSize="20px" />
            </Flex>
            <VStack align="start" spacing="0">
              <Text fontSize="xl" fontWeight="700" color={textColor}>
                {stats.total}
              </Text>
              <Text fontSize="xs" color={subtleText}>Total Incidents</Text>
            </VStack>
          </HStack>
        </Card>
        <Card p="20px" bg={cardBg}>
          <VStack align="start" spacing="4px">
            <HStack spacing="8px">
              <Icon as={MdError} color="red.500" boxSize="20px" />
              <Text fontSize="xl" fontWeight="700" color="red.500">{stats.open}</Text>
            </HStack>
            <Text fontSize="xs" color={subtleText}>Open Incidents</Text>
          </VStack>
        </Card>
        <Card p="20px" bg={cardBg}>
          <VStack align="start" spacing="4px">
            <HStack spacing="8px">
              <Icon as={MdCheckCircle} color="green.500" boxSize="20px" />
              <Text fontSize="xl" fontWeight="700" color="green.500">{stats.slaMet}</Text>
            </HStack>
            <Text fontSize="xs" color={subtleText}>SLA Met</Text>
          </VStack>
        </Card>
        <Card p="20px" bg={cardBg}>
          <VStack align="start" spacing="4px">
            <HStack spacing="8px">
              <Icon as={MdAccessTime} color="orange.500" boxSize="20px" />
              <Text fontSize="xl" fontWeight="700" color="orange.500">{stats.slaBreached}</Text>
            </HStack>
            <Text fontSize="xs" color={subtleText}>SLA Breached</Text>
          </VStack>
        </Card>
      </SimpleGrid>

      {/* Filters & Actions */}
      <Card p="16px" bg={cardBg} mb="20px">
        <HStack spacing="12px" justify="space-between" flexWrap="wrap">
          <HStack spacing="12px" flexWrap="wrap">
            <InputGroup maxW="250px">
              <InputLeftElement>
                <Icon as={MdSearch} color="gray.400" />
              </InputLeftElement>
              <Input
                placeholder="Search incidents..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                size="sm"
              />
            </InputGroup>
            <Select
              placeholder="All Severities"
              maxW="140px"
              size="sm"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
            >
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </Select>
            <Select
              placeholder="All Status"
              maxW="140px"
              size="sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="open">Open</option>
              <option value="investigating">Investigating</option>
              <option value="mitigating">Mitigating</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </Select>
          </HStack>
          <Button size="sm" leftIcon={<MdAdd />} colorScheme="brand" onClick={onCreateOpen}>
            Report Incident
          </Button>
        </HStack>
      </Card>

      {/* Incidents List */}
      <VStack spacing="12px" align="stretch">
        {loading && incidents.length === 0 ? (
          <Card p="40px" bg={cardBg} textAlign="center">
            <Spinner size="lg" color="brand.500" />
            <Text mt="16px" color="gray.500">Loading incidents...</Text>
          </Card>
        ) : incidents.length === 0 ? (
          <Card p="40px" bg={cardBg}>
            <Flex direction="column" align="center" justify="center" py="20px" color="gray.400">
              <Icon as={MdBugReport} boxSize="48px" mb="12px" />
              <Text fontWeight="500">No incidents found</Text>
              <Text fontSize="sm" mt="4px">Incidents will appear here when policy violations or security events are detected</Text>
            </Flex>
          </Card>
        ) : (
          incidents.map((incident) => {
            const SeverityIcon = severityIcons[incident.severity] || MdAssignment;
            const TypeIcon = typeIcons[incident.incidentType] || MdAssignment;
            return (
              <Card
                key={incident.id}
                p="20px"
                bg={cardBg}
                cursor="pointer"
                onClick={() => handleViewIncident(incident)}
                _hover={{ bg: hoverBg }}
              >
                <HStack justify="space-between" align="start">
                  <HStack spacing="16px" align="start" flex="1">
                    <Flex
                      w="40px"
                      h="40px"
                      bg={`${severityColors[incident.severity]}.100`}
                      borderRadius="10px"
                      align="center"
                      justify="center"
                    >
                      <Icon
                        as={SeverityIcon}
                        color={`${severityColors[incident.severity]}.500`}
                        boxSize="20px"
                      />
                    </Flex>
                    <VStack align="start" spacing="8px" flex="1">
                      <HStack spacing="8px" flexWrap="wrap">
                        <Badge colorScheme={severityColors[incident.severity]} fontSize="10px">
                          {incident.severityDisplay}
                        </Badge>
                        <Badge colorScheme={statusColors[incident.status]} fontSize="10px">
                          {incident.statusDisplay}
                        </Badge>
                        <Badge
                          colorScheme={slaColors[incident.slaStatus]}
                          fontSize="10px"
                          variant="outline"
                        >
                          SLA: {incident.slaStatus?.replace('_', ' ')}
                        </Badge>
                      </HStack>
                      <Text fontSize="md" fontWeight="600" color={textColor}>
                        {incident.title}
                      </Text>
                      <Text fontSize="sm" color={subtleText} noOfLines={2}>
                        {incident.description}
                      </Text>
                      <HStack spacing="16px" flexWrap="wrap">
                        <HStack spacing="4px">
                          <Icon as={TypeIcon} color="gray.400" boxSize="14px" />
                          <Text fontSize="xs" color={subtleText}>
                            {incident.incidentTypeDisplay}
                          </Text>
                        </HStack>
                        {incident.assignedToName && (
                          <HStack spacing="4px">
                            <Icon as={MdPerson} color="gray.400" boxSize="14px" />
                            <Text fontSize="xs" color={subtleText}>
                              {incident.assignedToName}
                            </Text>
                          </HStack>
                        )}
                        <HStack spacing="4px">
                          <Icon as={MdAccessTime} color="gray.400" boxSize="14px" />
                          <Text fontSize="xs" color={subtleText}>
                            {formatDateTime(incident.detectedAt)}
                          </Text>
                        </HStack>
                        {incident.affectedUserCount > 0 && (
                          <HStack spacing="4px">
                            <Icon as={MdSmartToy} color="gray.400" boxSize="14px" />
                            <Text fontSize="xs" color={subtleText}>
                              {incident.affectedUserCount} affected user{incident.affectedUserCount > 1 ? 's' : ''}
                            </Text>
                          </HStack>
                        )}
                      </HStack>
                    </VStack>
                  </HStack>
                  <Menu>
                    <MenuButton
                      as={IconButton}
                      icon={<MdMoreVert />}
                      variant="ghost"
                      size="sm"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <MenuList>
                      <MenuItem>Assign</MenuItem>
                      <MenuItem>Update Status</MenuItem>
                      <MenuItem>Add Comment</MenuItem>
                    </MenuList>
                  </Menu>
                </HStack>
              </Card>
            );
          })
        )}
      </VStack>

      {/* Update Status Modal */}
      <Modal isOpen={isStatusOpen} onClose={onStatusClose} size="sm">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Update Incident Status</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <FormControl>
              <FormLabel>New Status</FormLabel>
              <Select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
                <option value="open">Open</option>
                <option value="investigating">Investigating</option>
                <option value="mitigating">Mitigating</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </Select>
            </FormControl>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onStatusClose}>Cancel</Button>
            <Button
              colorScheme="brand"
              isLoading={updating}
              onClick={() => updateIncident({ variables: { input: { id: selectedIncident?.id, status: newStatus } } })}
            >
              Save
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Report Incident Modal */}
      <Modal isOpen={isCreateOpen} onClose={onCreateClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Report Incident</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing="16px">
              <FormControl isRequired>
                <FormLabel>Title</FormLabel>
                <Input value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} placeholder="Incident title" />
              </FormControl>
              <FormControl>
                <FormLabel>Description</FormLabel>
                <Textarea value={createDescription} onChange={(e) => setCreateDescription(e.target.value)} rows={3} placeholder="Describe the incident" />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>Severity</FormLabel>
                <Select value={createSeverity} onChange={(e) => setCreateSeverity(e.target.value)}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </Select>
              </FormControl>
              <FormControl isRequired>
                <FormLabel>Type</FormLabel>
                <Select value={createType} onChange={(e) => setCreateType(e.target.value)}>
                  <option value="policy_violation">Policy Violation</option>
                  <option value="security_breach">Security Breach</option>
                  <option value="data_leak">Data Leak</option>
                  <option value="service_disruption">Service Disruption</option>
                  <option value="compliance_breach">Compliance Breach</option>
                  <option value="cost_overrun">Cost Overrun</option>
                  <option value="harmful_output">Harmful Output</option>
                  <option value="other">Other</option>
                </Select>
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onCreateClose}>Cancel</Button>
            <Button
              colorScheme="brand"
              isLoading={creating}
              isDisabled={!createTitle.trim()}
              onClick={() => createIncident({ variables: { input: { title: createTitle, description: createDescription, severity: createSeverity, incidentType: createType } } })}
            >
              Report Incident
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Incident Detail Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <HStack spacing="12px">
              <Icon
                as={severityIcons[selectedIncident?.severity || 'low']}
                color={`${severityColors[selectedIncident?.severity || 'low']}.500`}
              />
              <Text>{selectedIncident?.title}</Text>
            </HStack>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {selectedIncident && (
              <VStack align="stretch" spacing="16px">
                <HStack spacing="8px" flexWrap="wrap">
                  <Badge colorScheme={severityColors[selectedIncident.severity]} fontSize="12px">
                    {selectedIncident.severityDisplay}
                  </Badge>
                  <Badge colorScheme={statusColors[selectedIncident.status]} fontSize="12px">
                    {selectedIncident.statusDisplay}
                  </Badge>
                  <Badge
                    colorScheme={slaColors[selectedIncident.slaStatus]}
                    fontSize="12px"
                    variant="outline"
                  >
                    SLA: {selectedIncident.slaStatus?.replace('_', ' ')}
                  </Badge>
                </HStack>

                <Box>
                  <Text fontSize="sm" color={subtleText}>{selectedIncident.description}</Text>
                </Box>

                <Divider />

                <SimpleGrid columns={2} spacing="16px">
                  <Box>
                    <Text fontSize="xs" color={subtleText} textTransform="uppercase">Type</Text>
                    <Text fontSize="sm">{selectedIncident.incidentTypeDisplay}</Text>
                  </Box>
                  <Box>
                    <Text fontSize="xs" color={subtleText} textTransform="uppercase">Assigned To</Text>
                    <Text fontSize="sm">{selectedIncident.assignedToName || 'Unassigned'}</Text>
                  </Box>
                  <Box>
                    <Text fontSize="xs" color={subtleText} textTransform="uppercase">Detected</Text>
                    <Text fontSize="sm">{formatDateTime(selectedIncident.detectedAt)}</Text>
                  </Box>
                  <Box>
                    <Text fontSize="xs" color={subtleText} textTransform="uppercase">Time to Acknowledge</Text>
                    <Text fontSize="sm">{formatDuration(selectedIncident.timeToAcknowledgeSeconds)}</Text>
                  </Box>
                  <Box>
                    <Text fontSize="xs" color={subtleText} textTransform="uppercase">Related Endpoint</Text>
                    <Text fontSize="sm">{selectedIncident.endpointName || 'N/A'}</Text>
                  </Box>
                  <Box>
                    <Text fontSize="xs" color={subtleText} textTransform="uppercase">Related Policy</Text>
                    <Text fontSize="sm">{selectedIncident.triggeringPolicyName || 'N/A'}</Text>
                  </Box>
                </SimpleGrid>

                {selectedIncident.rootCause && (
                  <>
                    <Divider />
                    <Box>
                      <Text fontSize="xs" color={subtleText} textTransform="uppercase" mb="8px">
                        Root Cause
                      </Text>
                      <Text fontSize="sm">{selectedIncident.rootCause}</Text>
                    </Box>
                  </>
                )}

                {selectedIncident.resolution && (
                  <Box>
                    <Text fontSize="xs" color={subtleText} textTransform="uppercase" mb="8px">
                      Resolution
                    </Text>
                    <Text fontSize="sm">{selectedIncident.resolution}</Text>
                  </Box>
                )}

                {selectedIncident.timelineEvents && selectedIncident.timelineEvents.length > 0 && (
                  <>
                    <Divider />
                    <Box>
                      <HStack mb="12px">
                        <Icon as={MdTimeline} />
                        <Text fontSize="sm" fontWeight="600">Timeline</Text>
                      </HStack>
                      <VStack align="stretch" spacing="8px">
                        {selectedIncident.timelineEvents.slice(0, 5).map((event, idx) => (
                          <HStack key={idx} spacing="12px" fontSize="xs">
                            <Text color={subtleText} minW="120px">
                              {formatDateTime(event.timestamp)}
                            </Text>
                            <Badge>{event.type}</Badge>
                            <Text>{event.description}</Text>
                          </HStack>
                        ))}
                      </VStack>
                    </Box>
                  </>
                )}

                {selectedIncident.tags && selectedIncident.tags.length > 0 && (
                  <Box>
                    <Text fontSize="xs" color={subtleText} textTransform="uppercase" mb="8px">Tags</Text>
                    <Wrap>
                      {selectedIncident.tags.map((tag, i) => (
                        <WrapItem key={i}>
                          <Tag variant="outline" size="sm">
                            <TagLabel>{tag}</TagLabel>
                          </Tag>
                        </WrapItem>
                      ))}
                    </Wrap>
                  </Box>
                )}
              </VStack>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr="8px" onClick={onClose}>Close</Button>
            <Button
              colorScheme="brand"
              onClick={() => {
                setNewStatus(selectedIncident?.status || 'open');
                onStatusOpen();
              }}
            >
              Update Status
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
