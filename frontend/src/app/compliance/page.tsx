'use client';

import {
  Box,
  Button,
  Flex,
  Icon,
  Text,
  useColorModeValue,
  Badge,
  SimpleGrid,
  Spinner,
  Progress,
  VStack,
  HStack,
  Tooltip,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  useToast,
} from '@chakra-ui/react';
import { useQuery } from '@apollo/client';
import { useMemo, useState } from 'react';
import {
  MdRefresh,
  MdVisibility,
  MdTune,
  MdCheckCircle,
  MdRadioButtonUnchecked,
  MdShield,
  MdDashboard,
  MdWarning,
  MdAssessment,
  MdDescription,
} from 'react-icons/md';
import Card from 'components/card/Card';
import ComplianceScore, { calculateComplianceScore } from 'components/zentinelle/ComplianceScore';
import GapAnalysis, { generateGapsFromCoverage } from 'components/zentinelle/GapAnalysis';
import FrameworkDetail, { generateFrameworkControls } from 'components/zentinelle/FrameworkDetail';
import ComplianceReport from 'components/zentinelle/ComplianceReport';
import { GET_COMPLIANCE_OVERVIEW } from 'graphql/compliance';
import { usePageHeader } from 'contexts/PageHeaderContext';

interface Capability {
  id: string;
  name: string;
  description: string;
  capabilityType: string;
  enabled: boolean;
  supportingPolicies: string[];
  supportingRules: string[];
  enforcementOptions?: string[];
  supportsFrameworks: string[];
}

interface FrameworkCoverage {
  id: string;
  name: string;
  description: string;
  requiredCovered: number;
  requiredTotal: number;
  requiredPercentage: number;
  missingRequired: string[];
  totalCovered: number;
  totalCount: number;
  totalPercentage: number;
  missingRecommended: string[];
}

interface ComplianceOverview {
  capabilitiesEnabled: number;
  capabilitiesTotal: number;
  observeCapabilities: Capability[];
  controlCapabilities: Capability[];
  frameworkCoverage: FrameworkCoverage[];
}

function getCoverageColor(percentage: number): string {
  if (percentage >= 80) return 'green';
  if (percentage >= 50) return 'yellow';
  if (percentage >= 25) return 'orange';
  return 'red';
}

function CapabilityCard({
  capability,
  textColor,
  cardBg,
  borderColor,
}: {
  capability: Capability;
  textColor: string;
  cardBg: string;
  borderColor: string;
}) {
  const isEnabled = capability.enabled;

  return (
    <Card
      p="16px"
      bg={cardBg}
      borderWidth="1px"
      borderColor={isEnabled ? 'green.200' : borderColor}
      opacity={isEnabled ? 1 : 0.7}
    >
      <Flex justify="space-between" align="flex-start" mb="8px">
        <HStack spacing="8px">
          <Icon
            as={isEnabled ? MdCheckCircle : MdRadioButtonUnchecked}
            color={isEnabled ? 'green.500' : 'gray.400'}
            boxSize="20px"
          />
          <Text fontWeight="600" color={textColor} fontSize="sm">
            {capability.name}
          </Text>
        </HStack>
        <Badge colorScheme={isEnabled ? 'green' : 'gray'} fontSize="10px">
          {isEnabled ? 'Active' : 'Inactive'}
        </Badge>
      </Flex>
      <Text fontSize="xs" color="gray.500" mb="12px">
        {capability.description}
      </Text>
      {isEnabled && (
        <VStack align="start" spacing="4px">
          {capability.supportingPolicies.length > 0 && (
            <Text fontSize="xs" color="gray.500">
              <Text as="span" fontWeight="500">Policies:</Text>{' '}
              {capability.supportingPolicies.join(', ')}
            </Text>
          )}
          {capability.supportingRules.length > 0 && (
            <Text fontSize="xs" color="gray.500">
              <Text as="span" fontWeight="500">Rules:</Text>{' '}
              {capability.supportingRules.join(', ')}
            </Text>
          )}
        </VStack>
      )}
      {!isEnabled && (
        <HStack spacing="4px" flexWrap="wrap">
          <Text fontSize="xs" color="gray.400">Supports:</Text>
          {capability.supportsFrameworks.slice(0, 3).map((fw) => (
            <Badge key={fw} size="sm" colorScheme="gray" fontSize="9px">
              {fw}
            </Badge>
          ))}
          {capability.supportsFrameworks.length > 3 && (
            <Badge size="sm" colorScheme="gray" fontSize="9px">
              +{capability.supportsFrameworks.length - 3}
            </Badge>
          )}
        </HStack>
      )}
    </Card>
  );
}

function FrameworkCard({
  framework,
  textColor,
  cardBg,
  borderColor,
  onSelect,
}: {
  framework: FrameworkCoverage;
  textColor: string;
  cardBg: string;
  borderColor: string;
  onSelect: (framework: FrameworkCoverage) => void;
}) {
  const requiredComplete = framework.requiredCovered === framework.requiredTotal;
  const colorScheme = getCoverageColor(framework.requiredPercentage);

  return (
    <Card
      p="20px"
      bg={cardBg}
      cursor="pointer"
      onClick={() => onSelect(framework)}
      _hover={{ borderColor: 'brand.400', transform: 'translateY(-2px)' }}
      transition="all 0.2s"
    >
      <Flex justify="space-between" align="center" mb="12px">
        <HStack spacing="12px">
          <Icon as={MdShield} color={`${colorScheme}.500`} boxSize="24px" />
          <Box>
            <Text fontWeight="600" color={textColor}>
              {framework.name}
            </Text>
            <Text fontSize="xs" color="gray.500">
              {framework.description}
            </Text>
          </Box>
        </HStack>
        <Badge colorScheme={requiredComplete ? 'green' : colorScheme} fontSize="sm">
          {framework.requiredCovered}/{framework.requiredTotal} Required
        </Badge>
      </Flex>

      <Box mb="8px">
        <Flex justify="space-between" mb="4px">
          <Text fontSize="xs" color="gray.500">Required Controls</Text>
          <Text fontSize="xs" fontWeight="600" color={textColor}>
            {Math.round(framework.requiredPercentage)}%
          </Text>
        </Flex>
        <Progress
          value={framework.requiredPercentage}
          colorScheme={colorScheme}
          size="sm"
          borderRadius="full"
        />
      </Box>

      <Box mb="12px">
        <Flex justify="space-between" mb="4px">
          <Text fontSize="xs" color="gray.500">Total Coverage (incl. recommended)</Text>
          <Text fontSize="xs" fontWeight="600" color={textColor}>
            {Math.round(framework.totalPercentage)}%
          </Text>
        </Flex>
        <Progress
          value={framework.totalPercentage}
          colorScheme="blue"
          size="xs"
          borderRadius="full"
        />
      </Box>

      {framework.missingRequired.length > 0 && (
        <Box>
          <Text fontSize="xs" color="orange.500" fontWeight="500" mb="4px">
            Missing required capabilities:
          </Text>
          <HStack spacing="4px" flexWrap="wrap">
            {framework.missingRequired.map((cap) => (
              <Tooltip key={cap} label={`Enable ${cap} to improve coverage`}>
                <Badge colorScheme="orange" fontSize="9px" cursor="help">
                  {cap.replace(/_/g, ' ')}
                </Badge>
              </Tooltip>
            ))}
          </HStack>
        </Box>
      )}

      {framework.missingRecommended.length > 0 && framework.missingRequired.length === 0 && (
        <Box>
          <Text fontSize="xs" color="blue.500" fontWeight="500" mb="4px">
            Recommended improvements:
          </Text>
          <HStack spacing="4px" flexWrap="wrap">
            {framework.missingRecommended.slice(0, 3).map((cap) => (
              <Badge key={cap} colorScheme="blue" variant="outline" fontSize="9px">
                {cap.replace(/_/g, ' ')}
              </Badge>
            ))}
            {framework.missingRecommended.length > 3 && (
              <Badge colorScheme="blue" variant="outline" fontSize="9px">
                +{framework.missingRecommended.length - 3} more
              </Badge>
            )}
          </HStack>
        </Box>
      )}
    </Card>
  );
}

export default function CompliancePage() {
  usePageHeader('Compliance Dashboard', 'AI governance, risk, and compliance overview');
  const cardBg = useColorModeValue('white', 'navy.800');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.100');
  const toast = useToast();

  const [selectedFramework, setSelectedFramework] = useState<FrameworkCoverage | null>(null);

  const { data, loading, error, refetch } = useQuery(GET_COMPLIANCE_OVERVIEW, {
    fetchPolicy: 'cache-and-network',
  });

  const overview: ComplianceOverview | null = data?.complianceOverview || null;

  // Calculate derived data
  const { overallScore, frameworkScores } = useMemo(() => {
    if (!overview?.frameworkCoverage) {
      return { overallScore: 0, frameworkScores: [] };
    }
    return calculateComplianceScore(overview.frameworkCoverage);
  }, [overview]);

  const gaps = useMemo(() => {
    if (!overview?.frameworkCoverage) return [];
    return generateGapsFromCoverage(overview.frameworkCoverage);
  }, [overview]);

  const enabledCapabilities = useMemo(() => {
    if (!overview) return [];
    return [
      ...(overview.observeCapabilities || []),
      ...(overview.controlCapabilities || []),
    ]
      .filter((c) => c.enabled)
      .map((c) => c.id);
  }, [overview]);

  // Generate framework detail with controls
  const selectedFrameworkWithControls = useMemo(() => {
    if (!selectedFramework) return null;

    const controls = generateFrameworkControls(
      selectedFramework.id,
      enabledCapabilities,
      selectedFramework.missingRequired,
      selectedFramework.missingRecommended
    );

    return {
      id: selectedFramework.id,
      name: selectedFramework.name,
      description: selectedFramework.description,
      score: selectedFramework.requiredPercentage,
      requiredCovered: selectedFramework.requiredCovered,
      requiredTotal: selectedFramework.requiredTotal,
      totalCovered: selectedFramework.totalCovered,
      totalCount: selectedFramework.totalCount,
      controls,
    };
  }, [selectedFramework, enabledCapabilities]);

  // Report data
  const reportFrameworks = useMemo(() => {
    if (!overview?.frameworkCoverage) return [];
    return overview.frameworkCoverage.map((fw) => ({
      id: fw.id,
      name: fw.name,
      score: fw.requiredPercentage,
      requiredCovered: fw.requiredCovered,
      requiredTotal: fw.requiredTotal,
      gapCount: fw.missingRequired.length,
    }));
  }, [overview]);

  const handleEnableCapability = (capabilityId: string) => {
    toast({
      title: 'Navigate to Policies',
      description: `Create a policy to enable ${capabilityId.replace(/_/g, ' ')}`,
      status: 'info',
      duration: 3000,
    });
  };

  const handleCreatePolicy = (policyType: string) => {
    window.location.href = `/zentinelle/policies/create?type=${policyType}`;
  };

  if (loading && !overview) {
    return (
      <Box pt={{ base: '130px', md: '80px', xl: '80px' }}>
        <Flex justify="center" py="40px">
          <Spinner size="xl" color="brand.500" />
        </Flex>
      </Box>
    );
  }

  if (error) {
    return (
      <Box pt={{ base: '130px', md: '80px', xl: '80px' }}>
        <Card p="20px" bg={cardBg}>
          <Text color="red.500">Error loading compliance data: {error.message}</Text>
        </Card>
      </Box>
    );
  }

  const enabledCount = overview?.capabilitiesEnabled || 0;
  const totalCount = overview?.capabilitiesTotal || 0;
  const criticalGaps = gaps.filter((g) => g.severity === 'critical' || g.severity === 'high').length;

  return (
    <Box pt={{ base: '130px', md: '80px', xl: '80px' }}>
      <Flex justify="flex-end" mb="20px">
        <Button
          variant="outline"
          leftIcon={<Icon as={MdRefresh} />}
          onClick={() => refetch()}
          isLoading={loading}
        >
          Refresh
        </Button>
      </Flex>

      {/* Quick Stats Bar */}
      <SimpleGrid columns={{ base: 2, md: 4 }} spacing="16px" mb="24px">
        <Card p="16px" bg={cardBg}>
          <HStack spacing="12px">
            <Icon as={MdShield} color="brand.500" boxSize="24px" />
            <VStack align="start" spacing="0">
              <Text fontSize="2xl" fontWeight="700" color={textColor}>
                {Math.round(overallScore)}%
              </Text>
              <Text fontSize="xs" color="gray.500">
                Compliance Score
              </Text>
            </VStack>
          </HStack>
        </Card>
        <Card p="16px" bg={cardBg}>
          <HStack spacing="12px">
            <Icon as={MdVisibility} color="blue.500" boxSize="24px" />
            <VStack align="start" spacing="0">
              <Text fontSize="2xl" fontWeight="700" color={textColor}>
                {enabledCount}/{totalCount}
              </Text>
              <Text fontSize="xs" color="gray.500">
                Capabilities
              </Text>
            </VStack>
          </HStack>
        </Card>
        <Card p="16px" bg={cardBg}>
          <HStack spacing="12px">
            <Icon as={MdAssessment} color="green.500" boxSize="24px" />
            <VStack align="start" spacing="0">
              <Text fontSize="2xl" fontWeight="700" color={textColor}>
                {frameworkScores.length}
              </Text>
              <Text fontSize="xs" color="gray.500">
                Frameworks
              </Text>
            </VStack>
          </HStack>
        </Card>
        <Card p="16px" bg={cardBg}>
          <HStack spacing="12px">
            <Icon as={MdWarning} color={criticalGaps > 0 ? 'orange.500' : 'green.500'} boxSize="24px" />
            <VStack align="start" spacing="0">
              <Text fontSize="2xl" fontWeight="700" color={criticalGaps > 0 ? 'orange.500' : textColor}>
                {criticalGaps}
              </Text>
              <Text fontSize="xs" color="gray.500">
                Critical Gaps
              </Text>
            </VStack>
          </HStack>
        </Card>
      </SimpleGrid>

      {/* Main Tabs */}
      <Tabs variant="enclosed" colorScheme="brand">
        <TabList mb="16px">
          <Tab><Icon as={MdDashboard} mr="8px" />Dashboard</Tab>
          <Tab><Icon as={MdShield} mr="8px" />Frameworks</Tab>
          <Tab><Icon as={MdWarning} mr="8px" />Gap Analysis</Tab>
          <Tab><Icon as={MdVisibility} mr="8px" />Capabilities</Tab>
          <Tab><Icon as={MdDescription} mr="8px" />Reports</Tab>
        </TabList>

        <TabPanels>
          {/* Dashboard Tab */}
          <TabPanel p="0">
            <SimpleGrid columns={{ base: 1, lg: 2 }} spacing="20px">
              <ComplianceScore
                overallScore={overallScore}
                frameworkScores={frameworkScores}
                lastAssessment={new Date().toISOString()}
              />
              <Card p="20px" bg={cardBg}>
                <Text fontSize="md" fontWeight="600" color={textColor} mb="16px">
                  Priority Actions
                </Text>
                {gaps.length === 0 ? (
                  <VStack py="40px">
                    <Icon as={MdCheckCircle} boxSize="48px" color="green.500" />
                    <Text color="gray.500">All compliance requirements met!</Text>
                  </VStack>
                ) : (
                  <VStack align="stretch" spacing="12px">
                    {gaps
                      .filter((g) => g.severity === 'critical' || g.severity === 'high')
                      .slice(0, 5)
                      .map((gap) => (
                        <HStack
                          key={gap.id}
                          p="12px"
                          bg={useColorModeValue('gray.50', 'whiteAlpha.100')}
                          borderRadius="md"
                          justify="space-between"
                        >
                          <HStack spacing="12px">
                            <Icon
                              as={MdWarning}
                              color={gap.severity === 'critical' ? 'red.500' : 'orange.500'}
                            />
                            <VStack align="start" spacing="0">
                              <Text fontSize="sm" fontWeight="500" color={textColor}>
                                {gap.capability}
                              </Text>
                              <Text fontSize="xs" color="gray.500">
                                Affects {gap.frameworks.length} framework{gap.frameworks.length > 1 ? 's' : ''}
                              </Text>
                            </VStack>
                          </HStack>
                          <Badge
                            colorScheme={gap.severity === 'critical' ? 'red' : 'orange'}
                          >
                            {gap.severity}
                          </Badge>
                        </HStack>
                      ))}
                    {gaps.filter((g) => g.severity === 'critical' || g.severity === 'high').length > 5 && (
                      <Text fontSize="sm" color="gray.500" textAlign="center">
                        +{gaps.filter((g) => g.severity === 'critical' || g.severity === 'high').length - 5} more gaps
                      </Text>
                    )}
                  </VStack>
                )}
              </Card>
            </SimpleGrid>
          </TabPanel>

          {/* Frameworks Tab */}
          <TabPanel p="0">
            {selectedFrameworkWithControls ? (
              <Box>
                <Button
                  variant="ghost"
                  size="sm"
                  mb="16px"
                  onClick={() => setSelectedFramework(null)}
                >
                  ← Back to all frameworks
                </Button>
                <FrameworkDetail
                  framework={selectedFrameworkWithControls}
                  onViewPolicy={handleCreatePolicy}
                />
              </Box>
            ) : (
              <>
                <Text fontSize="sm" color="gray.500" mb="16px">
                  Click on a framework to view detailed control status. Your enabled capabilities
                  determine compliance coverage.
                </Text>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing="16px">
                  {overview?.frameworkCoverage?.map((fw) => (
                    <FrameworkCard
                      key={fw.id}
                      framework={fw}
                      textColor={textColor}
                      cardBg={cardBg}
                      borderColor={borderColor}
                      onSelect={setSelectedFramework}
                    />
                  ))}
                </SimpleGrid>
              </>
            )}
          </TabPanel>

          {/* Gap Analysis Tab */}
          <TabPanel p="0">
            <GapAnalysis
              gaps={gaps}
              onEnableCapability={handleEnableCapability}
              onCreatePolicy={handleCreatePolicy}
            />
          </TabPanel>

          {/* Capabilities Tab */}
          <TabPanel p="0">
            <Text fontSize="md" fontWeight="600" color={textColor} mb="12px">
              <Icon as={MdVisibility} mr="8px" verticalAlign="middle" />
              Observability - What we can detect
            </Text>
            <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing="16px" mb="24px">
              {overview?.observeCapabilities?.map((cap) => (
                <CapabilityCard
                  key={cap.id}
                  capability={cap}
                  textColor={textColor}
                  cardBg={cardBg}
                  borderColor={borderColor}
                />
              ))}
            </SimpleGrid>

            <Text fontSize="md" fontWeight="600" color={textColor} mb="12px">
              <Icon as={MdTune} mr="8px" verticalAlign="middle" />
              Controllability - What we can enforce
            </Text>
            <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing="16px">
              {overview?.controlCapabilities?.map((cap) => (
                <CapabilityCard
                  key={cap.id}
                  capability={cap}
                  textColor={textColor}
                  cardBg={cardBg}
                  borderColor={borderColor}
                />
              ))}
            </SimpleGrid>
          </TabPanel>

          {/* Reports Tab */}
          <TabPanel p="0">
            <ComplianceReport
              organizationName="Your Organization"
              overallScore={overallScore}
              frameworks={reportFrameworks}
            />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Box>
  );
}
