'use client';

import {
  Box,
  Button,
  Flex,
  Icon,
  Text,
  useColorModeValue,
  VStack,
  HStack,
  FormControl,
  FormLabel,
  Input,
  Select,
  Textarea,
  useToast,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Switch,
  Divider,
  Spinner,
  FormHelperText,
  Checkbox,
  Grid,
  GridItem,
  Show,
} from '@chakra-ui/react';
import { useMutation, useQuery } from '@apollo/client';
import { useState, useEffect, useMemo } from 'react';
import { MdArrowBack } from 'react-icons/md';
import { useRouter } from 'next/navigation';
import Card from 'components/card/Card';
import PolicyHelper from 'components/zentinelle/PolicyHelper';
import ModelSelector from 'components/zentinelle/ModelSelector';
import DynamicListInput from 'components/zentinelle/DynamicListInput';
import { CREATE_POLICY, GET_POLICY_OPTIONS } from 'graphql/policies';
import { useOrganization } from 'contexts/OrganizationContext';

interface PolicyFormData {
  name: string;
  description: string;
  policyType: string;
  scopeType: string;
  scopeId: string;
  priority: number;
  enforcement: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

interface PolicyTypeOption {
  value: string;
  label: string;
  description: string;
  category: string;
  configSchema: Record<string, string>;
}

interface ScopeTypeOption {
  value: string;
  label: string;
}

interface EnforcementOption {
  value: string;
  label: string;
  description: string;
}

interface PolicyOptions {
  policyTypes: PolicyTypeOption[];
  scopeTypes: ScopeTypeOption[];
  enforcementLevels: EnforcementOption[];
}

// Helper to render config field based on type
function ConfigField({
  fieldName,
  fieldType,
  value,
  onChange,
  policyType,
}: {
  fieldName: string;
  fieldType: string;
  value: unknown;
  onChange: (value: unknown) => void;
  policyType?: string;
}) {
  const labelColor = useColorModeValue('gray.700', 'gray.200');

  // Convert snake_case to Title Case
  const label = fieldName
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  if (fieldType === 'int' || fieldType === 'float') {
    return (
      <FormControl>
        <FormLabel color={labelColor}>{label}</FormLabel>
        <NumberInput
          value={value as number || 0}
          onChange={(_, val) => onChange(isNaN(val) ? 0 : val)}
          min={0}
          precision={fieldType === 'float' ? 2 : 0}
        >
          <NumberInputField />
          <NumberInputStepper>
            <NumberIncrementStepper />
            <NumberDecrementStepper />
          </NumberInputStepper>
        </NumberInput>
      </FormControl>
    );
  }

  if (fieldType === 'bool') {
    return (
      <FormControl display="flex" alignItems="center">
        <Checkbox
          isChecked={value as boolean || false}
          onChange={(e) => onChange(e.target.checked)}
          colorScheme="brand"
        >
          {label}
        </Checkbox>
      </FormControl>
    );
  }

  if (fieldType === 'list') {
    // Special handling for model_restriction policy type
    if (policyType === 'model_restriction') {
      if (fieldName === 'allowed_models') {
        return (
          <FormControl>
            <FormLabel color={labelColor}>{label}</FormLabel>
            <ModelSelector
              selectedModels={Array.isArray(value) ? (value as string[]) : []}
              onChange={(models) => onChange(models)}
              mode="allowed"
              placeholder="Search models to allow..."
            />
          </FormControl>
        );
      }
      if (fieldName === 'blocked_models') {
        return (
          <FormControl>
            <FormLabel color={labelColor}>{label}</FormLabel>
            <ModelSelector
              selectedModels={Array.isArray(value) ? (value as string[]) : []}
              onChange={(models) => onChange(models)}
              mode="blocked"
              placeholder="Search models to block..."
            />
          </FormControl>
        );
      }
      if (fieldName === 'allowed_providers') {
        // Use a simpler multi-select for providers
        return (
          <FormControl>
            <FormLabel color={labelColor}>{label}</FormLabel>
            <Select
              placeholder="Select providers..."
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  const current = Array.isArray(value) ? (value as string[]) : [];
                  if (!current.includes(e.target.value)) {
                    onChange([...current, e.target.value]);
                  }
                }
              }}
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="google">Google AI</option>
              <option value="mistral">Mistral AI</option>
              <option value="deepseek">DeepSeek</option>
              <option value="cohere">Cohere</option>
              <option value="groq">Groq</option>
            </Select>
            {Array.isArray(value) && (value as string[]).length > 0 && (
              <Flex gap="8px" mt="8px" flexWrap="wrap">
                {(value as string[]).map((provider) => (
                  <Box
                    key={provider}
                    px="12px"
                    py="4px"
                    bg="brand.50"
                    borderRadius="full"
                    fontSize="sm"
                    display="flex"
                    alignItems="center"
                    gap="8px"
                  >
                    {provider}
                    <Box
                      as="button"
                      type="button"
                      onClick={() =>
                        onChange((value as string[]).filter((p) => p !== provider))
                      }
                      cursor="pointer"
                      _hover={{ color: 'red.500' }}
                    >
                      ×
                    </Box>
                  </Box>
                ))}
              </Flex>
            )}
            <FormHelperText>Select which AI providers are allowed</FormHelperText>
          </FormControl>
        );
      }
    }

    // Fields that benefit from multi-line text entries (use textarea)
    const multiLineFields = ['blocked_topics', 'blocked_patterns', 'required_capabilities', 'allowed_actions', 'blocked_actions'];

    // Fields that are simple tags/identifiers (use single-line input)
    const tagFields = ['applies_to', 'allowed_databases', 'allowed_secrets', 'blocked_domains'];

    const isMultiLine = multiLineFields.includes(fieldName);
    const isTag = tagFields.includes(fieldName);

    return (
      <DynamicListInput
        label={label}
        value={Array.isArray(value) ? (value as string[]) : []}
        onChange={(newValue) => onChange(newValue)}
        placeholder={isTag ? 'Enter value' : 'Enter item'}
        inputType={isMultiLine ? 'textarea' : 'input'}
        minItems={1}
        maxItems={isTag ? 10 : 20}
        addButtonText={`Add ${label.split(' ').pop()}`}
        helperText={isTag ? 'Add items one at a time' : 'Add entries dynamically as needed'}
      />
    );
  }

  // Default: string input
  return (
    <FormControl>
      <FormLabel color={labelColor}>{label}</FormLabel>
      <Textarea
        placeholder={`Enter ${label.toLowerCase()}`}
        value={(value as string) || ''}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
      />
    </FormControl>
  );
}

export default function CreatePolicyPage() {
  const router = useRouter();
  const toast = useToast();
  const { organizationId } = useOrganization();

  const cardBg = useColorModeValue('white', 'navy.800');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.100');

  // Fetch policy options from backend
  const { data: optionsData, loading: optionsLoading } = useQuery<{ policyOptions: PolicyOptions }>(
    GET_POLICY_OPTIONS
  );

  const policyOptions = optionsData?.policyOptions;

  // Initialize form data with first values once options load
  const [formData, setFormData] = useState<PolicyFormData>({
    name: '',
    description: '',
    policyType: '',
    scopeType: '',
    priority: 100,
    enforcement: '',
    enabled: true,
    scopeId: '',
    config: {},
  });

  // Config state for current policy type
  const [configValues, setConfigValues] = useState<Record<string, unknown>>({});

  // Set default values when options load
  useEffect(() => {
    if (policyOptions && !formData.policyType) {
      setFormData((prev) => ({
        ...prev,
        policyType: policyOptions.policyTypes[0]?.value || '',
        scopeType: policyOptions.scopeTypes[0]?.value || '',
        enforcement: policyOptions.enforcementLevels[0]?.value || '',
      }));
    }
  }, [policyOptions, formData.policyType]);

  // Get current policy type's config schema
  const currentPolicyType = useMemo(() => {
    return policyOptions?.policyTypes.find((t) => t.value === formData.policyType);
  }, [policyOptions, formData.policyType]);

  // Parse configSchema — graphene.JSONString() returns it as a JSON string
  const parsedConfigSchema = useMemo<Record<string, string>>(() => {
    const raw = currentPolicyType?.configSchema;
    if (!raw) return {};
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch { return {}; }
    }
    return raw as Record<string, string>;
  }, [currentPolicyType?.configSchema]);

  // Reset config values when policy type changes
  useEffect(() => {
    if (Object.keys(parsedConfigSchema).length > 0) {
      const initialConfig: Record<string, unknown> = {};
      Object.entries(parsedConfigSchema).forEach(([key, type]) => {
        if (type === 'int' || type === 'float') {
          initialConfig[key] = 0;
        } else if (type === 'bool') {
          initialConfig[key] = false;
        } else if (type === 'list') {
          initialConfig[key] = [];
        } else {
          initialConfig[key] = '';
        }
      });
      setConfigValues(initialConfig);
    }
  }, [parsedConfigSchema]);

  const [createPolicy, { loading }] = useMutation(CREATE_POLICY, {
    onCompleted: (result) => {
      if (result.createPolicy?.success && result.createPolicy?.policy) {
        toast({ title: 'Policy created successfully', status: 'success' });
        router.push('/policies');
      } else {
        toast({ title: 'Failed to create policy', description: result.createPolicy?.error, status: 'error' });
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) {
      toast({ title: 'No organization found', status: 'error' });
      return;
    }
    createPolicy({
      variables: {
        organizationId,
        input: {
          name: formData.name,
          description: formData.description,
          policyType: formData.policyType,
          scopeType: formData.scopeType,
          priority: formData.priority,
          enforcement: formData.enforcement,
          enabled: formData.enabled,
          config: JSON.stringify(configValues),
        },
      },
    });
  };

  // Group policy types by category
  const groupedPolicyTypes = useMemo(() => {
    if (!policyOptions?.policyTypes) return {};
    return policyOptions.policyTypes.reduce((acc, type) => {
      const category = type.category || 'Other';
      if (!acc[category]) acc[category] = [];
      acc[category].push(type);
      return acc;
    }, {} as Record<string, PolicyTypeOption[]>);
  }, [policyOptions?.policyTypes]);

  if (optionsLoading) {
    return (
      <Box pt={{ base: '130px', md: '80px', xl: '80px' }}>
        <Flex justify="center" align="center" minH="200px">
          <Spinner size="xl" />
        </Flex>
      </Box>
    );
  }

  return (
    <Box pt={{ base: '130px', md: '80px', xl: '80px' }}>
      {/* Header */}
      <Flex align="center" mb="24px">
        <Button variant="ghost" leftIcon={<Icon as={MdArrowBack} />} onClick={() => router.back()} mr="16px">
          Back
        </Button>
        <Box>
          <Text fontSize="2xl" fontWeight="700" color={textColor}>
            Create Policy
          </Text>
          <Text fontSize="sm" color="gray.500">
            Define a new governance policy
          </Text>
        </Box>
      </Flex>

      <Grid templateColumns={{ base: '1fr', lg: '1fr 320px' }} gap="24px">
        <GridItem>
          <Card p="24px" bg={cardBg}>
            <form onSubmit={handleSubmit}>
              <VStack spacing="20px" align="stretch">
                {/* Basic Info */}
                <FormControl isRequired>
              <FormLabel>Policy Name</FormLabel>
              <Input
                placeholder="e.g., Production Rate Limit"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </FormControl>

            <FormControl>
              <FormLabel>Description</FormLabel>
              <Textarea
                placeholder="Describe what this policy does..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
              />
            </FormControl>

            <Divider borderColor={borderColor} />

            {/* Policy Type & Scope */}
            <HStack spacing="16px" align="start">
              <FormControl isRequired flex="1">
                <FormLabel>Policy Type</FormLabel>
                <Select
                  value={formData.policyType}
                  onChange={(e) => setFormData({ ...formData, policyType: e.target.value })}
                >
                  {Object.entries(groupedPolicyTypes).map(([category, types]) => (
                    <optgroup key={category} label={category}>
                      {types.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
                {currentPolicyType?.description && (
                  <FormHelperText>{currentPolicyType.description}</FormHelperText>
                )}
              </FormControl>

              <FormControl isRequired flex="1">
                <FormLabel>Scope</FormLabel>
                <Select
                  value={formData.scopeType}
                  onChange={(e) => setFormData({ ...formData, scopeType: e.target.value })}
                >
                  {policyOptions?.scopeTypes.map((scope) => (
                    <option key={scope.value} value={scope.value}>
                      {scope.label}
                    </option>
                  ))}
                </Select>
              </FormControl>
            </HStack>

            {formData.scopeType !== 'organization' && (
              <FormControl>
                <FormLabel>Scope Target</FormLabel>
                <Input
                  placeholder={`Enter the ${formData.scopeType} ID this policy applies to`}
                  value={formData.scopeId}
                  onChange={(e) => setFormData({ ...formData, scopeId: e.target.value })}
                />
              </FormControl>
            )}

            <HStack spacing="16px">
              <FormControl flex="1">
                <FormLabel>Enforcement</FormLabel>
                <Select
                  value={formData.enforcement}
                  onChange={(e) => setFormData({ ...formData, enforcement: e.target.value })}
                >
                  {policyOptions?.enforcementLevels.map((level) => (
                    <option key={level.value} value={level.value}>
                      {level.label} - {level.description}
                    </option>
                  ))}
                </Select>
              </FormControl>

              <FormControl flex="1">
                <FormLabel>Priority</FormLabel>
                <NumberInput
                  value={formData.priority}
                  onChange={(_, val) => setFormData({ ...formData, priority: isNaN(val) ? 0 : val })}
                  min={0}
                  max={1000}
                >
                  <NumberInputField />
                  <NumberInputStepper>
                    <NumberIncrementStepper />
                    <NumberDecrementStepper />
                  </NumberInputStepper>
                </NumberInput>
                <FormHelperText>Higher priority overrides lower</FormHelperText>
              </FormControl>
            </HStack>

            <Divider borderColor={borderColor} />

            {/* Type-specific config fields */}
            {currentPolicyType && (
              <>
                <Text fontWeight="600" color={textColor}>
                  {currentPolicyType.label} Configuration
                </Text>
                {Object.keys(parsedConfigSchema).length > 0 &&
                  Object.entries(parsedConfigSchema).map(([fieldName, fieldType]) => (
                    <ConfigField
                      key={fieldName}
                      fieldName={fieldName}
                      fieldType={fieldType}
                      value={configValues[fieldName]}
                      onChange={(value) =>
                        setConfigValues((prev) => ({ ...prev, [fieldName]: value }))
                      }
                      policyType={formData.policyType}
                    />
                  ))}
              </>
            )}

            <Divider borderColor={borderColor} />

            {/* Enable/Disable */}
            <FormControl display="flex" alignItems="center" justifyContent="space-between">
              <Box>
                <FormLabel mb="0">Enable Policy</FormLabel>
                <Text fontSize="sm" color="gray.500">
                  Policy will be active immediately after creation
                </Text>
              </Box>
              <Switch
                isChecked={formData.enabled}
                onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                colorScheme="brand"
              />
            </FormControl>

                <HStack spacing="12px" pt="8px">
                  <Button variant="outline" onClick={() => router.back()}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="brand" isLoading={loading} isDisabled={!formData.name}>
                    Create Policy
                  </Button>
                </HStack>
              </VStack>
            </form>
          </Card>
        </GridItem>

        {/* Policy Helper Sidebar */}
        <Show above="lg">
          <GridItem>
            <Box position="sticky" top="100px">
              <PolicyHelper policyType={formData.policyType} />
            </Box>
          </GridItem>
        </Show>
      </Grid>
    </Box>
  );
}
