'use client';

import {
  Box,
  VStack,
  HStack,
  Text,
  Progress,
  CircularProgress,
  CircularProgressLabel,
  Badge,
  Icon,
  SimpleGrid,
  Tooltip,
  useColorModeValue,
} from '@chakra-ui/react';
import {
  MdShield,
  MdWarning,
  MdCheckCircle,
  MdError,
  MdTrendingUp,
  MdTrendingDown,
  MdTrendingFlat,
} from 'react-icons/md';

interface FrameworkScore {
  id: string;
  name: string;
  score: number;
  requiredCovered: number;
  requiredTotal: number;
  weight?: number;
}

interface ComplianceScoreProps {
  overallScore: number;
  frameworkScores: FrameworkScore[];
  previousScore?: number;
  lastAssessment?: string;
  compact?: boolean;
}

function getRiskLevel(score: number): {
  level: string;
  color: string;
  icon: typeof MdShield;
  description: string;
} {
  if (score >= 90) {
    return {
      level: 'Low',
      color: 'green',
      icon: MdCheckCircle,
      description: 'Excellent compliance posture',
    };
  }
  if (score >= 70) {
    return {
      level: 'Medium',
      color: 'yellow',
      icon: MdShield,
      description: 'Good compliance with minor gaps',
    };
  }
  if (score >= 50) {
    return {
      level: 'High',
      color: 'orange',
      icon: MdWarning,
      description: 'Significant compliance gaps',
    };
  }
  return {
    level: 'Critical',
    color: 'red',
    icon: MdError,
    description: 'Urgent compliance action needed',
  };
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'green';
  if (score >= 60) return 'yellow';
  if (score >= 40) return 'orange';
  return 'red';
}

function getTrendIcon(current: number, previous?: number) {
  if (previous === undefined) return null;
  const diff = current - previous;
  if (diff > 2) return { icon: MdTrendingUp, color: 'green.500', label: `+${diff.toFixed(0)}%` };
  if (diff < -2) return { icon: MdTrendingDown, color: 'red.500', label: `${diff.toFixed(0)}%` };
  return { icon: MdTrendingFlat, color: 'gray.500', label: 'No change' };
}

export default function ComplianceScore({
  overallScore,
  frameworkScores,
  previousScore,
  lastAssessment,
  compact = false,
}: ComplianceScoreProps) {
  // All hooks must be called before any conditional returns
  const cardBg = useColorModeValue('white', 'navy.800');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.200');
  const trackColor = useColorModeValue('gray.100', 'whiteAlpha.200');
  const statBg = useColorModeValue('gray.50', 'whiteAlpha.100');

  const risk = getRiskLevel(overallScore);
  const trend = getTrendIcon(overallScore, previousScore);
  const scoreColor = getScoreColor(overallScore);

  // Calculate summary stats
  const totalRequired = frameworkScores.reduce((sum, f) => sum + f.requiredTotal, 0);
  const totalCovered = frameworkScores.reduce((sum, f) => sum + f.requiredCovered, 0);
  const frameworksCompliant = frameworkScores.filter((f) => f.score >= 80).length;

  if (compact) {
    return (
      <HStack
        spacing="16px"
        p="16px"
        bg={cardBg}
        borderRadius="lg"
        border="1px solid"
        borderColor={borderColor}
      >
        <CircularProgress
          value={overallScore}
          size="60px"
          color={`${scoreColor}.400`}
          trackColor={trackColor}
        >
          <CircularProgressLabel fontWeight="700" fontSize="md">
            {Math.round(overallScore)}
          </CircularProgressLabel>
        </CircularProgress>
        <VStack align="start" spacing="2px">
          <HStack spacing="8px">
            <Text fontWeight="600" color={textColor}>
              Compliance Score
            </Text>
            <Badge colorScheme={risk.color}>{risk.level} Risk</Badge>
          </HStack>
          <Text fontSize="xs" color="gray.500">
            {totalCovered}/{totalRequired} controls • {frameworksCompliant}/{frameworkScores.length} frameworks
          </Text>
        </VStack>
      </HStack>
    );
  }

  return (
    <Box
      p="24px"
      bg={cardBg}
      borderRadius="lg"
      border="1px solid"
      borderColor={borderColor}
    >
      <HStack justify="space-between" align="flex-start" mb="20px">
        <VStack align="start" spacing="4px">
          <Text fontSize="sm" color="gray.500" fontWeight="500">
            Overall Compliance Score
          </Text>
          <HStack spacing="12px">
            <CircularProgress
              value={overallScore}
              size="100px"
              thickness="10px"
              color={`${scoreColor}.400`}
              trackColor={trackColor}
            >
              <CircularProgressLabel>
                <VStack spacing="0">
                  <Text fontSize="2xl" fontWeight="700" color={textColor}>
                    {Math.round(overallScore)}
                  </Text>
                  <Text fontSize="xs" color="gray.500">
                    / 100
                  </Text>
                </VStack>
              </CircularProgressLabel>
            </CircularProgress>
            <VStack align="start" spacing="8px">
              <HStack spacing="8px">
                <Icon as={risk.icon} color={`${risk.color}.500`} boxSize="20px" />
                <Badge colorScheme={risk.color} fontSize="sm" px="8px" py="2px">
                  {risk.level} Risk
                </Badge>
              </HStack>
              <Text fontSize="sm" color="gray.500">
                {risk.description}
              </Text>
              {trend && (
                <HStack spacing="4px" fontSize="xs">
                  <Icon as={trend.icon} color={trend.color} />
                  <Text color={trend.color}>{trend.label} from last assessment</Text>
                </HStack>
              )}
            </VStack>
          </HStack>
        </VStack>

        {/* Quick Stats */}
        <SimpleGrid columns={2} spacing="12px">
          <VStack
            align="center"
            p="12px"
            bg={statBg}
            borderRadius="md"
            minW="100px"
          >
            <Text fontSize="2xl" fontWeight="700" color={textColor}>
              {frameworkScores.length}
            </Text>
            <Text fontSize="xs" color="gray.500" textAlign="center">
              Frameworks Tracked
            </Text>
          </VStack>
          <VStack
            align="center"
            p="12px"
            bg={statBg}
            borderRadius="md"
            minW="100px"
          >
            <Text fontSize="2xl" fontWeight="700" color="green.500">
              {frameworksCompliant}
            </Text>
            <Text fontSize="xs" color="gray.500" textAlign="center">
              Frameworks Compliant
            </Text>
          </VStack>
          <VStack
            align="center"
            p="12px"
            bg={statBg}
            borderRadius="md"
            minW="100px"
          >
            <Text fontSize="2xl" fontWeight="700" color={textColor}>
              {totalCovered}
            </Text>
            <Text fontSize="xs" color="gray.500" textAlign="center">
              Controls Passed
            </Text>
          </VStack>
          <VStack
            align="center"
            p="12px"
            bg={statBg}
            borderRadius="md"
            minW="100px"
          >
            <Text fontSize="2xl" fontWeight="700" color="orange.500">
              {totalRequired - totalCovered}
            </Text>
            <Text fontSize="xs" color="gray.500" textAlign="center">
              Open Gaps
            </Text>
          </VStack>
        </SimpleGrid>
      </HStack>

      {/* Framework Breakdown */}
      <Box>
        <Text fontSize="sm" fontWeight="600" color={textColor} mb="12px">
          Framework Breakdown
        </Text>
        <VStack spacing="12px" align="stretch">
          {frameworkScores.map((framework) => (
            <Box key={framework.id}>
              <HStack justify="space-between" mb="4px">
                <HStack spacing="8px">
                  <Icon
                    as={MdShield}
                    color={`${getScoreColor(framework.score)}.500`}
                    boxSize="16px"
                  />
                  <Text fontSize="sm" fontWeight="500" color={textColor}>
                    {framework.name}
                  </Text>
                </HStack>
                <HStack spacing="8px">
                  <Tooltip
                    label={`${framework.requiredCovered}/${framework.requiredTotal} required controls`}
                  >
                    <Badge
                      colorScheme={getScoreColor(framework.score)}
                      fontSize="xs"
                      cursor="help"
                    >
                      {Math.round(framework.score)}%
                    </Badge>
                  </Tooltip>
                </HStack>
              </HStack>
              <Progress
                value={framework.score}
                size="xs"
                colorScheme={getScoreColor(framework.score)}
                borderRadius="full"
              />
            </Box>
          ))}
        </VStack>
      </Box>

      {/* Last Assessment */}
      {lastAssessment && (
        <Text fontSize="xs" color="gray.400" mt="16px" textAlign="right">
          Last assessed: {new Date(lastAssessment).toLocaleDateString()}
        </Text>
      )}
    </Box>
  );
}

// Helper function to calculate overall score from framework coverage
export function calculateComplianceScore(
  frameworkCoverage: Array<{
    id: string;
    name: string;
    requiredPercentage: number;
    requiredCovered: number;
    requiredTotal: number;
  }>
): { overallScore: number; frameworkScores: FrameworkScore[] } {
  if (frameworkCoverage.length === 0) {
    return { overallScore: 0, frameworkScores: [] };
  }

  const frameworkScores: FrameworkScore[] = frameworkCoverage.map((fw) => ({
    id: fw.id,
    name: fw.name,
    score: fw.requiredPercentage,
    requiredCovered: fw.requiredCovered,
    requiredTotal: fw.requiredTotal,
  }));

  // Weighted average based on number of required controls
  const totalWeight = frameworkScores.reduce((sum, f) => sum + f.requiredTotal, 0);
  const weightedSum = frameworkScores.reduce(
    (sum, f) => sum + f.score * f.requiredTotal,
    0
  );

  const overallScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

  return { overallScore, frameworkScores };
}
