'use client';

import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Icon,
  Progress,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Tooltip,
  Button,
  Divider,
  useColorModeValue,
} from '@chakra-ui/react';
import {
  MdShield,
  MdCheckCircle,
  MdCancel,
  MdRemoveCircle,
  MdPending,
  MdDescription,
  MdPolicy,
  MdDownload,
  MdOpenInNew,
} from 'react-icons/md';

interface Control {
  id: string;
  name: string;
  description: string;
  status: 'compliant' | 'gap' | 'not_applicable';
  required: boolean;
  evidenceStatus: 'collected' | 'missing' | 'pending';
  linkedCapability?: string;
  linkedPolicy?: string;
}

interface Framework {
  id: string;
  name: string;
  description: string;
  score: number;
  requiredCovered: number;
  requiredTotal: number;
  totalCovered: number;
  totalCount: number;
  controls: Control[];
}

interface FrameworkDetailProps {
  framework: Framework;
  onExport?: (frameworkId: string, format: 'pdf' | 'csv') => void;
  onViewPolicy?: (policyType: string) => void;
}

const STATUS_CONFIG = {
  compliant: { icon: MdCheckCircle, color: 'green', label: 'Compliant' },
  gap: { icon: MdCancel, color: 'red', label: 'Gap' },
  not_applicable: { icon: MdRemoveCircle, color: 'gray', label: 'N/A' },
};

const EVIDENCE_CONFIG = {
  collected: { icon: MdDescription, color: 'green', label: 'Collected' },
  missing: { icon: MdCancel, color: 'red', label: 'Missing' },
  pending: { icon: MdPending, color: 'yellow', label: 'Pending' },
};

function getScoreColor(score: number): string {
  if (score >= 80) return 'green';
  if (score >= 60) return 'yellow';
  if (score >= 40) return 'orange';
  return 'red';
}

// Generate controls from capabilities for a framework
export function generateFrameworkControls(
  frameworkId: string,
  enabledCapabilities: string[],
  missingRequired: string[],
  missingRecommended: string[]
): Control[] {
  // Control definitions per framework
  const FRAMEWORK_CONTROLS: Record<string, Array<{
    id: string;
    name: string;
    description: string;
    capability: string;
    required: boolean;
  }>> = {
    hipaa: [
      { id: 'hipaa_phi', name: 'PHI Protection', description: 'Detect and protect Protected Health Information', capability: 'phi_detection', required: true },
      { id: 'hipaa_pii', name: 'PII Protection', description: 'Detect and protect Personally Identifiable Information', capability: 'pii_detection', required: true },
      { id: 'hipaa_audit', name: 'Audit Controls', description: 'Maintain audit logs of all AI interactions', capability: 'audit_logging', required: true },
      { id: 'hipaa_filter', name: 'Content Filtering', description: 'Filter inappropriate health-related content', capability: 'content_filtering', required: true },
      { id: 'hipaa_retention', name: 'Data Retention', description: 'Enforce data retention policies', capability: 'data_retention', required: true },
      { id: 'hipaa_access', name: 'Access Control', description: 'Control who can access AI systems', capability: 'agent_capability_control', required: false },
    ],
    gdpr: [
      { id: 'gdpr_pii', name: 'Personal Data Protection', description: 'Detect and protect personal data', capability: 'pii_detection', required: true },
      { id: 'gdpr_audit', name: 'Processing Records', description: 'Maintain records of AI processing activities', capability: 'audit_logging', required: true },
      { id: 'gdpr_retention', name: 'Storage Limitation', description: 'Enforce data retention limits', capability: 'data_retention', required: true },
      { id: 'gdpr_memory', name: 'Right to Erasure', description: 'Enable data deletion from AI memory', capability: 'agent_memory_control', required: true },
      { id: 'gdpr_filter', name: 'Purpose Limitation', description: 'Filter AI responses to authorized purposes', capability: 'content_filtering', required: false },
    ],
    soc2: [
      { id: 'soc2_audit', name: 'Audit Logging', description: 'Comprehensive audit trail of AI operations', capability: 'audit_logging', required: true },
      { id: 'soc2_secrets', name: 'Secret Management', description: 'Protect credentials and API keys', capability: 'secret_detection', required: true },
      { id: 'soc2_rate', name: 'Availability Controls', description: 'Rate limiting and availability protection', capability: 'rate_limiting', required: true },
      { id: 'soc2_cost', name: 'Cost Controls', description: 'Monitor and control AI spending', capability: 'cost_tracking', required: false },
      { id: 'soc2_usage', name: 'Usage Monitoring', description: 'Track AI usage patterns', capability: 'usage_analytics', required: false },
    ],
    eu_ai_act: [
      { id: 'euai_audit', name: 'Transparency Logging', description: 'Maintain AI decision audit trail', capability: 'audit_logging', required: true },
      { id: 'euai_model', name: 'Model Governance', description: 'Track and control AI model usage', capability: 'model_tracking', required: true },
      { id: 'euai_oversight', name: 'Human Oversight', description: 'Enable human review of AI decisions', capability: 'human_oversight', required: true },
      { id: 'euai_injection', name: 'Security Controls', description: 'Protect against prompt injection', capability: 'prompt_injection_detection', required: true },
      { id: 'euai_jailbreak', name: 'Manipulation Prevention', description: 'Detect jailbreak attempts', capability: 'jailbreak_detection', required: false },
      { id: 'euai_usage', name: 'Usage Analytics', description: 'Analyze AI usage patterns', capability: 'usage_analytics', required: false },
    ],
    nist_ai_rmf: [
      { id: 'nist_model', name: 'Model Inventory', description: 'Maintain AI model inventory', capability: 'model_tracking', required: true },
      { id: 'nist_oversight', name: 'Governance Controls', description: 'Human oversight of AI systems', capability: 'human_oversight', required: true },
      { id: 'nist_injection', name: 'Adversarial Robustness', description: 'Protection against adversarial inputs', capability: 'prompt_injection_detection', required: true },
      { id: 'nist_jailbreak', name: 'Manipulation Detection', description: 'Detect manipulation attempts', capability: 'jailbreak_detection', required: false },
    ],
    ccpa: [
      { id: 'ccpa_pii', name: 'Consumer Data Protection', description: 'Detect California consumer personal information', capability: 'pii_detection', required: true },
      { id: 'ccpa_retention', name: 'Data Deletion', description: 'Support consumer deletion requests', capability: 'data_retention', required: true },
      { id: 'ccpa_memory', name: 'Memory Management', description: 'Control AI memory of consumer data', capability: 'agent_memory_control', required: false },
    ],
    iso27001: [
      { id: 'iso_audit', name: 'Security Logging', description: 'Maintain security audit logs', capability: 'audit_logging', required: true },
      { id: 'iso_secrets', name: 'Credential Protection', description: 'Protect secrets and credentials', capability: 'secret_detection', required: true },
      { id: 'iso_access', name: 'Access Control', description: 'Control system access', capability: 'agent_capability_control', required: false },
    ],
    iso42001: [
      { id: 'iso42_model', name: 'AI Model Management', description: 'Inventory and manage AI models', capability: 'model_tracking', required: true },
      { id: 'iso42_restrict', name: 'Model Restrictions', description: 'Restrict unauthorized model usage', capability: 'model_restriction', required: true },
    ],
    pci_dss: [
      { id: 'pci_secrets', name: 'Cardholder Data Protection', description: 'Protect payment credentials', capability: 'secret_detection', required: true },
      { id: 'pci_audit', name: 'Access Logging', description: 'Log access to cardholder data', capability: 'audit_logging', required: true },
      { id: 'pci_pii', name: 'PII Detection', description: 'Detect card numbers and PII', capability: 'pii_detection', required: false },
    ],
  };

  const normalizedFrameworkId = frameworkId.toLowerCase().replace(/-/g, '_').replace(/ /g, '_');
  const controlDefs = FRAMEWORK_CONTROLS[normalizedFrameworkId] || [];

  const normalizedEnabled = enabledCapabilities.map((c) =>
    c.toLowerCase().replace(/ /g, '_')
  );
  const normalizedMissingReq = missingRequired.map((c) =>
    c.toLowerCase().replace(/ /g, '_')
  );

  return controlDefs.map((def) => {
    const normalizedCap = def.capability.toLowerCase().replace(/ /g, '_');
    const isEnabled = normalizedEnabled.includes(normalizedCap);
    const isMissingReq = normalizedMissingReq.includes(normalizedCap);

    let status: 'compliant' | 'gap' | 'not_applicable' = 'compliant';
    if (isMissingReq || (!isEnabled && def.required)) {
      status = 'gap';
    } else if (!isEnabled && !def.required) {
      status = 'not_applicable';
    }

    // For v1, evidence status is derived from compliance status
    let evidenceStatus: 'collected' | 'missing' | 'pending' = 'pending';
    if (status === 'compliant') {
      evidenceStatus = 'collected';
    } else if (status === 'gap') {
      evidenceStatus = 'missing';
    }

    return {
      id: def.id,
      name: def.name,
      description: def.description,
      status,
      required: def.required,
      evidenceStatus,
      linkedCapability: def.capability,
    };
  });
}

export default function FrameworkDetail({
  framework,
  onExport,
  onViewPolicy,
}: FrameworkDetailProps) {
  const cardBg = useColorModeValue('white', 'navy.800');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.200');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const tableBg = useColorModeValue('gray.50', 'whiteAlpha.50');

  const scoreColor = getScoreColor(framework.score);

  // Calculate stats
  const compliantCount = framework.controls.filter((c) => c.status === 'compliant').length;
  const gapCount = framework.controls.filter((c) => c.status === 'gap').length;
  const requiredControls = framework.controls.filter((c) => c.required);
  const requiredCompliant = requiredControls.filter((c) => c.status === 'compliant').length;

  return (
    <Box
      p="20px"
      bg={cardBg}
      borderRadius="lg"
      border="1px solid"
      borderColor={borderColor}
    >
      {/* Header */}
      <HStack justify="space-between" mb="20px">
        <HStack spacing="16px">
          <Icon as={MdShield} color={`${scoreColor}.500`} boxSize="32px" />
          <VStack align="start" spacing="2px">
            <Text fontSize="lg" fontWeight="700" color={textColor}>
              {framework.name}
            </Text>
            <Text fontSize="sm" color="gray.500">
              {framework.description}
            </Text>
          </VStack>
        </HStack>
        <HStack spacing="8px">
          {onExport && (
            <>
              <Button
                size="sm"
                variant="outline"
                leftIcon={<MdDownload />}
                onClick={() => onExport(framework.id, 'csv')}
              >
                CSV
              </Button>
              <Button
                size="sm"
                variant="outline"
                leftIcon={<MdDownload />}
                onClick={() => onExport(framework.id, 'pdf')}
              >
                PDF
              </Button>
            </>
          )}
        </HStack>
      </HStack>

      {/* Score Summary */}
      <HStack spacing="24px" mb="20px" p="16px" bg={tableBg} borderRadius="md">
        <VStack align="center" spacing="4px">
          <Text fontSize="3xl" fontWeight="700" color={`${scoreColor}.500`}>
            {Math.round(framework.score)}%
          </Text>
          <Text fontSize="xs" color="gray.500">
            Overall Score
          </Text>
        </VStack>
        <Divider orientation="vertical" h="60px" />
        <VStack align="start" spacing="8px" flex="1">
          <HStack justify="space-between" w="100%">
            <Text fontSize="sm" color="gray.500">
              Required Controls
            </Text>
            <Text fontSize="sm" fontWeight="600" color={textColor}>
              {requiredCompliant}/{requiredControls.length}
            </Text>
          </HStack>
          <Progress
            value={(requiredCompliant / requiredControls.length) * 100 || 0}
            size="sm"
            colorScheme={scoreColor}
            borderRadius="full"
            w="100%"
          />
        </VStack>
        <Divider orientation="vertical" h="60px" />
        <HStack spacing="16px">
          <VStack align="center">
            <Badge colorScheme="green" fontSize="md" px="12px" py="4px">
              {compliantCount}
            </Badge>
            <Text fontSize="xs" color="gray.500">
              Compliant
            </Text>
          </VStack>
          <VStack align="center">
            <Badge colorScheme="red" fontSize="md" px="12px" py="4px">
              {gapCount}
            </Badge>
            <Text fontSize="xs" color="gray.500">
              Gaps
            </Text>
          </VStack>
        </HStack>
      </HStack>

      {/* Control Checklist */}
      <Text fontSize="sm" fontWeight="600" color={textColor} mb="12px">
        Control Checklist
      </Text>
      <Box overflowX="auto">
        <Table size="sm">
          <Thead>
            <Tr>
              <Th borderColor={borderColor}>Control</Th>
              <Th borderColor={borderColor} w="100px">
                Status
              </Th>
              <Th borderColor={borderColor} w="100px">
                Required
              </Th>
              <Th borderColor={borderColor} w="100px">
                Evidence
              </Th>
              <Th borderColor={borderColor} w="80px">
                Action
              </Th>
            </Tr>
          </Thead>
          <Tbody>
            {framework.controls.map((control) => {
              const statusConfig = STATUS_CONFIG[control.status];
              const evidenceConfig = EVIDENCE_CONFIG[control.evidenceStatus];

              return (
                <Tr key={control.id}>
                  <Td borderColor={borderColor}>
                    <VStack align="start" spacing="2px">
                      <Text fontSize="sm" fontWeight="500" color={textColor}>
                        {control.name}
                      </Text>
                      <Text fontSize="xs" color="gray.500">
                        {control.description}
                      </Text>
                    </VStack>
                  </Td>
                  <Td borderColor={borderColor}>
                    <Tooltip label={statusConfig.label}>
                      <HStack spacing="4px">
                        <Icon
                          as={statusConfig.icon}
                          color={`${statusConfig.color}.500`}
                          boxSize="16px"
                        />
                        <Badge
                          colorScheme={statusConfig.color}
                          fontSize="10px"
                        >
                          {statusConfig.label}
                        </Badge>
                      </HStack>
                    </Tooltip>
                  </Td>
                  <Td borderColor={borderColor}>
                    <Badge
                      colorScheme={control.required ? 'purple' : 'gray'}
                      variant={control.required ? 'solid' : 'outline'}
                      fontSize="10px"
                    >
                      {control.required ? 'Required' : 'Optional'}
                    </Badge>
                  </Td>
                  <Td borderColor={borderColor}>
                    <Tooltip label={evidenceConfig.label}>
                      <HStack spacing="4px">
                        <Icon
                          as={evidenceConfig.icon}
                          color={`${evidenceConfig.color}.500`}
                          boxSize="14px"
                        />
                        <Text fontSize="xs" color="gray.500">
                          {evidenceConfig.label}
                        </Text>
                      </HStack>
                    </Tooltip>
                  </Td>
                  <Td borderColor={borderColor}>
                    {control.status === 'gap' && control.linkedCapability && onViewPolicy && (
                      <Tooltip label="View related policy">
                        <Button
                          size="xs"
                          variant="ghost"
                          colorScheme="brand"
                          onClick={() => onViewPolicy(control.linkedCapability!)}
                        >
                          <Icon as={MdOpenInNew} />
                        </Button>
                      </Tooltip>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      </Box>
    </Box>
  );
}
