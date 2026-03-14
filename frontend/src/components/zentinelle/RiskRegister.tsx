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
  Select,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
  Tooltip,
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
  Spinner,
  Alert,
  AlertIcon,
} from '@chakra-ui/react';
import { useState, useMemo } from 'react';
import { useQuery } from '@apollo/client';
import {
  MdAdd,
  MdEdit,
  MdDelete,
  MdWarning,
  MdShield,
  MdTrendingUp,
  MdMoreVert,
  MdSecurity,
  MdPolicy,
  MdSmartToy,
  MdPerson,
} from 'react-icons/md';
import Card from 'components/card/Card';
import { GET_RISKS, GET_RISK_STATS } from 'graphql/risk';

interface Risk {
  id: string;
  name: string;
  description: string;
  category: string;
  categoryDisplay: string;
  status: string;
  statusDisplay: string;
  likelihood: number;
  likelihoodDisplay: string;
  impact: number;
  impactDisplay: string;
  riskScore: number;
  riskLevel: string;
  mitigationPlan: string;
  mitigationStatus: string;
  residualRiskScore: number;
  ownerName: string | null;
  lastReviewedAt: string | null;
  nextReviewDate: string | null;
  incidentCount: number;
  tags: string[];
  createdAt: string;
}

function getRiskLevelDisplay(level: string): { label: string; color: string } {
  switch (level) {
    case 'critical':
      return { label: 'Critical', color: 'red' };
    case 'high':
      return { label: 'High', color: 'orange' };
    case 'medium':
      return { label: 'Medium', color: 'yellow' };
    default:
      return { label: 'Low', color: 'green' };
  }
}

export default function RiskRegister() {
  const cardBg = useColorModeValue('white', 'navy.800');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.200');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const subtleText = useColorModeValue('gray.500', 'gray.400');
  const hoverBg = useColorModeValue('gray.50', 'whiteAlpha.100');

  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedRisk, setSelectedRisk] = useState<Risk | null>(null);

  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isOpen: isMatrixOpen, onOpen: onMatrixOpen, onClose: onMatrixClose } = useDisclosure();

  // Fetch risks
  const { data, loading, error } = useQuery(GET_RISKS, {
    variables: {
      category: categoryFilter || undefined,
      status: statusFilter || undefined,
      first: 100,
    },
    pollInterval: 60000,
  });

  // Fetch stats
  const { data: statsData } = useQuery(GET_RISK_STATS, {
    pollInterval: 60000,
  });

  // Transform data
  const risks: Risk[] = useMemo(() => {
    if (!data?.risks?.edges) return [];
    return data.risks.edges.map((edge: { node: Risk }) => edge.node);
  }, [data]);

  // Stats from backend or computed
  const stats = useMemo(() => {
    const riskStats = statsData?.riskStats;
    if (riskStats) {
      return {
        total: riskStats.totalRisks || 0,
        critical: riskStats.criticalRisks || 0,
        high: riskStats.highRisks || 0,
        medium: riskStats.risksByLevel?.find((r: { level: string }) => r.level === 'medium')?.count || 0,
        low: riskStats.risksByLevel?.find((r: { level: string }) => r.level === 'low')?.count || 0,
      };
    }
    // Fallback to client computation
    const critical = risks.filter((r) => r.riskLevel === 'critical').length;
    const high = risks.filter((r) => r.riskLevel === 'high').length;
    const medium = risks.filter((r) => r.riskLevel === 'medium').length;
    const low = risks.filter((r) => r.riskLevel === 'low').length;
    return { total: risks.length, critical, high, medium, low };
  }, [risks, statsData]);

  const handleViewRisk = (risk: Risk) => {
    setSelectedRisk(risk);
    onOpen();
  };

  const categoryColors: Record<string, string> = {
    security: 'red',
    privacy: 'purple',
    compliance: 'purple',
    operational: 'blue',
    reputational: 'orange',
    financial: 'green',
    ethical: 'cyan',
  };

  const categoryIcons: Record<string, React.ElementType> = {
    security: MdSecurity,
    privacy: MdPolicy,
    compliance: MdPolicy,
    operational: MdSmartToy,
    reputational: MdPerson,
    financial: MdTrendingUp,
    ethical: MdShield,
  };

  const statusColors: Record<string, string> = {
    identified: 'gray',
    assessed: 'blue',
    mitigating: 'yellow',
    accepted: 'green',
    transferred: 'purple',
    closed: 'green',
  };

  // Risk Matrix Component
  const RiskMatrix = () => {
    const matrixCells = [];
    for (let impact = 5; impact >= 1; impact--) {
      for (let likelihood = 1; likelihood <= 5; likelihood++) {
        const score = impact * likelihood;
        const level = score >= 15 ? 'critical' : score >= 10 ? 'high' : score >= 5 ? 'medium' : 'low';
        const levelDisplay = getRiskLevelDisplay(level);
        const risksInCell = risks.filter((r) => r.likelihood === likelihood && r.impact === impact);

        matrixCells.push(
          <Tooltip
            key={`${likelihood}-${impact}`}
            label={`L${likelihood} x I${impact} = ${score} (${levelDisplay.label})${risksInCell.length > 0 ? ` - ${risksInCell.length} risk(s)` : ''}`}
          >
            <Box
              bg={`${levelDisplay.color}.${score >= 15 ? '500' : score >= 10 ? '400' : score >= 5 ? '300' : '200'}`}
              p="8px"
              borderRadius="md"
              textAlign="center"
              cursor="pointer"
              position="relative"
              _hover={{ opacity: 0.8 }}
            >
              <Text fontSize="xs" fontWeight="600" color={score >= 10 ? 'white' : textColor}>
                {score}
              </Text>
              {risksInCell.length > 0 && (
                <Badge
                  position="absolute"
                  top="-8px"
                  right="-8px"
                  borderRadius="full"
                  colorScheme={levelDisplay.color}
                  fontSize="10px"
                >
                  {risksInCell.length}
                </Badge>
              )}
            </Box>
          </Tooltip>
        );
      }
    }
    return (
      <Box>
        <HStack spacing="4px" mb="4px">
          <Box w="60px" />
          {[1, 2, 3, 4, 5].map((l) => (
            <Box key={l} flex="1" textAlign="center">
              <Text fontSize="10px" color={subtleText}>{l}</Text>
            </Box>
          ))}
        </HStack>
        <HStack spacing="4px" mb="8px">
          <Box w="60px" />
          <Text fontSize="10px" color={subtleText} flex="1" textAlign="center">Likelihood →</Text>
        </HStack>
        {[5, 4, 3, 2, 1].map((impact, rowIdx) => (
          <HStack key={impact} spacing="4px" mb="4px">
            <Box w="60px" textAlign="right" pr="8px">
              <Text fontSize="10px" color={subtleText}>{impact}</Text>
            </Box>
            {matrixCells.slice(rowIdx * 5, rowIdx * 5 + 5)}
          </HStack>
        ))}
        <HStack spacing="4px" mt="4px">
          <Box w="60px" textAlign="right" pr="8px">
            <Text fontSize="10px" color={subtleText}>↑ Impact</Text>
          </Box>
        </HStack>
      </Box>
    );
  };

  if (error) {
    return (
      <Alert status="error">
        <AlertIcon />
        Failed to load risks: {error.message}
      </Alert>
    );
  }

  return (
    <Box>
      {/* Stats */}
      <SimpleGrid columns={{ base: 2, md: 5 }} spacing="16px" mb="20px">
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
              <Icon as={MdShield} color="white" boxSize="20px" />
            </Flex>
            <VStack align="start" spacing="0">
              <Text fontSize="xl" fontWeight="700" color={textColor}>
                {stats.total}
              </Text>
              <Text fontSize="xs" color={subtleText}>Total Risks</Text>
            </VStack>
          </HStack>
        </Card>
        <Card p="20px" bg={cardBg}>
          <VStack align="start" spacing="4px">
            <HStack spacing="8px">
              <Box w="8px" h="8px" borderRadius="full" bg="red.500" />
              <Text fontSize="xl" fontWeight="700" color="red.500">{stats.critical}</Text>
            </HStack>
            <Text fontSize="xs" color={subtleText}>Critical</Text>
          </VStack>
        </Card>
        <Card p="20px" bg={cardBg}>
          <VStack align="start" spacing="4px">
            <HStack spacing="8px">
              <Box w="8px" h="8px" borderRadius="full" bg="orange.500" />
              <Text fontSize="xl" fontWeight="700" color="orange.500">{stats.high}</Text>
            </HStack>
            <Text fontSize="xs" color={subtleText}>High</Text>
          </VStack>
        </Card>
        <Card p="20px" bg={cardBg}>
          <VStack align="start" spacing="4px">
            <HStack spacing="8px">
              <Box w="8px" h="8px" borderRadius="full" bg="yellow.500" />
              <Text fontSize="xl" fontWeight="700" color="yellow.600">{stats.medium}</Text>
            </HStack>
            <Text fontSize="xs" color={subtleText}>Medium</Text>
          </VStack>
        </Card>
        <Card p="20px" bg={cardBg}>
          <VStack align="start" spacing="4px">
            <HStack spacing="8px">
              <Box w="8px" h="8px" borderRadius="full" bg="green.500" />
              <Text fontSize="xl" fontWeight="700" color="green.500">{stats.low}</Text>
            </HStack>
            <Text fontSize="xs" color={subtleText}>Low</Text>
          </VStack>
        </Card>
      </SimpleGrid>

      {/* Filters & Actions */}
      <Card p="16px" bg={cardBg} mb="20px">
        <HStack spacing="12px" justify="space-between" flexWrap="wrap">
          <HStack spacing="12px">
            <Select
              placeholder="All Categories"
              maxW="160px"
              size="sm"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="security">Security</option>
              <option value="privacy">Privacy</option>
              <option value="compliance">Compliance</option>
              <option value="operational">Operational</option>
              <option value="reputational">Reputational</option>
              <option value="financial">Financial</option>
              <option value="ethical">Ethical</option>
            </Select>
            <Select
              placeholder="All Status"
              maxW="140px"
              size="sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="identified">Identified</option>
              <option value="assessed">Assessed</option>
              <option value="mitigating">Mitigating</option>
              <option value="accepted">Accepted</option>
              <option value="transferred">Transferred</option>
              <option value="closed">Closed</option>
            </Select>
          </HStack>
          <HStack spacing="8px">
            <Button size="sm" variant="outline" onClick={onMatrixOpen}>
              View Matrix
            </Button>
            <Button size="sm" leftIcon={<MdAdd />} colorScheme="brand">
              Add Risk
            </Button>
          </HStack>
        </HStack>
      </Card>

      {/* Risk Table */}
      <Card p="0" bg={cardBg} overflow="hidden">
        {loading && risks.length === 0 ? (
          <Box p="40px" textAlign="center">
            <Spinner size="lg" color="brand.500" />
            <Text mt="16px" color="gray.500">Loading risks...</Text>
          </Box>
        ) : risks.length === 0 ? (
          <Box p="40px" textAlign="center">
            <Text color="gray.500">No risks registered yet</Text>
            <Text fontSize="sm" color="gray.400" mt="8px">
              Add risks to track potential AI-related concerns
            </Text>
          </Box>
        ) : (
          <Box overflowX="auto">
            <Table size="sm">
              <Thead>
                <Tr>
                  <Th borderColor={borderColor}>Risk</Th>
                  <Th borderColor={borderColor}>Category</Th>
                  <Th borderColor={borderColor}>Score</Th>
                  <Th borderColor={borderColor}>L x I</Th>
                  <Th borderColor={borderColor}>Status</Th>
                  <Th borderColor={borderColor}>Owner</Th>
                  <Th borderColor={borderColor}>Incidents</Th>
                  <Th borderColor={borderColor}>Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {risks.map((risk) => {
                  const levelDisplay = getRiskLevelDisplay(risk.riskLevel);
                  const IconComponent = categoryIcons[risk.category] || MdShield;
                  return (
                    <Tr key={risk.id} _hover={{ bg: hoverBg }} cursor="pointer" onClick={() => handleViewRisk(risk)}>
                      <Td borderColor={borderColor} maxW="250px">
                        <VStack align="start" spacing="2px">
                          <Text fontSize="sm" fontWeight="500" noOfLines={1}>
                            {risk.name}
                          </Text>
                          <Text fontSize="xs" color={subtleText} noOfLines={1}>
                            {risk.description}
                          </Text>
                        </VStack>
                      </Td>
                      <Td borderColor={borderColor}>
                        <Badge
                          colorScheme={categoryColors[risk.category] || 'gray'}
                          fontSize="10px"
                          display="flex"
                          alignItems="center"
                          gap="4px"
                          w="fit-content"
                        >
                          <Icon as={IconComponent} boxSize="12px" />
                          {risk.categoryDisplay}
                        </Badge>
                      </Td>
                      <Td borderColor={borderColor}>
                        <Badge colorScheme={levelDisplay.color} fontSize="sm" px="12px" py="4px">
                          {risk.riskScore}
                        </Badge>
                      </Td>
                      <Td borderColor={borderColor}>
                        <Text fontSize="xs" color={subtleText}>
                          {risk.likelihood} x {risk.impact}
                        </Text>
                      </Td>
                      <Td borderColor={borderColor}>
                        <Badge colorScheme={statusColors[risk.status] || 'gray'} fontSize="10px">
                          {risk.statusDisplay}
                        </Badge>
                      </Td>
                      <Td borderColor={borderColor}>
                        <Text fontSize="xs">{risk.ownerName || 'Unassigned'}</Text>
                      </Td>
                      <Td borderColor={borderColor}>
                        <Badge colorScheme={risk.incidentCount > 0 ? 'red' : 'gray'} fontSize="10px">
                          {risk.incidentCount}
                        </Badge>
                      </Td>
                      <Td borderColor={borderColor} onClick={(e) => e.stopPropagation()}>
                        <Menu>
                          <MenuButton
                            as={IconButton}
                            icon={<MdMoreVert />}
                            variant="ghost"
                            size="sm"
                          />
                          <MenuList>
                            <MenuItem icon={<MdEdit />}>Edit Risk</MenuItem>
                            <MenuItem icon={<MdDelete />} color="red.500">Delete Risk</MenuItem>
                          </MenuList>
                        </Menu>
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </Box>
        )}
      </Card>

      {/* Risk Detail Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size="xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <HStack spacing="12px">
              <Icon as={MdWarning} color={`${getRiskLevelDisplay(selectedRisk?.riskLevel || 'low').color}.500`} />
              <Text>{selectedRisk?.name}</Text>
            </HStack>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {selectedRisk && (
              <VStack align="stretch" spacing="16px">
                <Box>
                  <Text fontSize="sm" color={subtleText}>{selectedRisk.description}</Text>
                </Box>

                <SimpleGrid columns={4} spacing="16px">
                  <Box>
                    <Text fontSize="xs" color={subtleText} textTransform="uppercase">Risk Score</Text>
                    <Badge colorScheme={getRiskLevelDisplay(selectedRisk.riskLevel).color} fontSize="lg" px="12px" py="4px" mt="4px">
                      {selectedRisk.riskScore}
                    </Badge>
                  </Box>
                  <Box>
                    <Text fontSize="xs" color={subtleText} textTransform="uppercase">Likelihood</Text>
                    <Text fontSize="lg" fontWeight="600">{selectedRisk.likelihood}/5</Text>
                  </Box>
                  <Box>
                    <Text fontSize="xs" color={subtleText} textTransform="uppercase">Impact</Text>
                    <Text fontSize="lg" fontWeight="600">{selectedRisk.impact}/5</Text>
                  </Box>
                  <Box>
                    <Text fontSize="xs" color={subtleText} textTransform="uppercase">Status</Text>
                    <Badge colorScheme={statusColors[selectedRisk.status] || 'gray'} mt="4px">
                      {selectedRisk.statusDisplay}
                    </Badge>
                  </Box>
                </SimpleGrid>

                <Divider />

                {selectedRisk.mitigationPlan && (
                  <Box>
                    <Text fontSize="xs" color={subtleText} textTransform="uppercase" mb="8px">
                      Mitigation Plan
                    </Text>
                    <Text fontSize="sm">{selectedRisk.mitigationPlan}</Text>
                  </Box>
                )}

                {selectedRisk.mitigationStatus && (
                  <Box>
                    <Text fontSize="xs" color={subtleText} textTransform="uppercase" mb="8px">
                      Mitigation Status
                    </Text>
                    <Text fontSize="sm">{selectedRisk.mitigationStatus}</Text>
                  </Box>
                )}

                {selectedRisk.residualRiskScore !== selectedRisk.riskScore && (
                  <Box>
                    <Text fontSize="xs" color={subtleText} textTransform="uppercase" mb="8px">
                      Residual Risk Score
                    </Text>
                    <Badge colorScheme={getRiskLevelDisplay(selectedRisk.residualRiskScore >= 15 ? 'critical' : selectedRisk.residualRiskScore >= 10 ? 'high' : selectedRisk.residualRiskScore >= 5 ? 'medium' : 'low').color}>
                      {selectedRisk.residualRiskScore}
                    </Badge>
                  </Box>
                )}

                <Divider />

                <SimpleGrid columns={2} spacing="16px">
                  <Box>
                    <Text fontSize="xs" color={subtleText} textTransform="uppercase">Owner</Text>
                    <Text fontSize="sm">{selectedRisk.ownerName || 'Unassigned'}</Text>
                  </Box>
                  <Box>
                    <Text fontSize="xs" color={subtleText} textTransform="uppercase">Next Review</Text>
                    <Text fontSize="sm">
                      {selectedRisk.nextReviewDate
                        ? new Date(selectedRisk.nextReviewDate).toLocaleDateString()
                        : 'Not scheduled'}
                    </Text>
                  </Box>
                </SimpleGrid>

                {selectedRisk.tags && selectedRisk.tags.length > 0 && (
                  <Box>
                    <Text fontSize="xs" color={subtleText} textTransform="uppercase" mb="8px">Tags</Text>
                    <Wrap>
                      {selectedRisk.tags.map((tag, i) => (
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
            <Button colorScheme="brand" leftIcon={<MdEdit />}>Edit Risk</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Risk Matrix Modal */}
      <Modal isOpen={isMatrixOpen} onClose={onMatrixClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Risk Matrix</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <RiskMatrix />
            <Divider my="16px" />
            <SimpleGrid columns={4} spacing="8px">
              <HStack>
                <Box w="16px" h="16px" borderRadius="sm" bg="green.300" />
                <Text fontSize="xs">Low (1-4)</Text>
              </HStack>
              <HStack>
                <Box w="16px" h="16px" borderRadius="sm" bg="yellow.300" />
                <Text fontSize="xs">Medium (5-9)</Text>
              </HStack>
              <HStack>
                <Box w="16px" h="16px" borderRadius="sm" bg="orange.400" />
                <Text fontSize="xs">High (10-14)</Text>
              </HStack>
              <HStack>
                <Box w="16px" h="16px" borderRadius="sm" bg="red.500" />
                <Text fontSize="xs">Critical (15-25)</Text>
              </HStack>
            </SimpleGrid>
          </ModalBody>
          <ModalFooter>
            <Button onClick={onMatrixClose}>Close</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
