'use client';

import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Icon,
  useColorModeValue,
  SimpleGrid,
  Textarea,
  Input,
  Badge,
  Flex,
  Progress,
  IconButton,
  Tooltip,
  Code,
  Collapse,
  useDisclosure,
  FormControl,
  FormLabel,
  FormHelperText,
  Wrap,
  WrapItem,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  useToast,
  Divider,
  Alert,
  AlertIcon,
} from '@chakra-ui/react';
import { useState, useMemo, useCallback } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import {
  MdArrowBack,
  MdArrowForward,
  MdCode,
  MdPerson,
  MdSecurity,
  MdTune,
  MdList,
  MdInfo,
  MdCheck,
  MdAdd,
  MdDelete,
  MdRefresh,
  MdLightbulb,
  MdContentCopy,
  MdSave,
  MdPlayArrow,
  MdExpandMore,
  MdExpandLess,
  MdAutoAwesome,
} from 'react-icons/md';
import Card from 'components/card/Card';
import TokenCalculator from './TokenCalculator';
import {
  GET_PROMPT_CATEGORIES,
  CREATE_SYSTEM_PROMPT,
  TEST_SYSTEM_PROMPT,
  ANALYZE_SYSTEM_PROMPT,
  PROMPT_TYPE_OPTIONS,
  PROVIDER_OPTIONS,
} from 'graphql/prompts';

// =============================================================================
// Types & Constants
// =============================================================================

interface PromptVariable {
  name: string;
  description: string;
  defaultValue: string;
}

interface GeneratorState {
  promptType: string;
  categorySlug: string;
  providers: string[];
  models: string[];
  name: string;
  description: string;
  promptText: string;
  variables: PromptVariable[];
  temperature: number | null;
  maxTokens: number | null;
  useCases: string[];
  visibility: string;
}

const INITIAL_STATE: GeneratorState = {
  promptType: '',
  categorySlug: '',
  providers: [],
  models: [],
  name: '',
  description: '',
  promptText: '',
  variables: [],
  temperature: null,
  maxTokens: null,
  useCases: [],
  visibility: 'organization',
};

const PROMPT_TYPE_ICONS: Record<string, React.ElementType> = {
  system: MdCode,
  persona: MdPerson,
  task: MdTune,
  safety: MdSecurity,
  few_shot: MdList,
  format: MdInfo,
  chain: MdAutoAwesome,
};

const PROMPT_TYPE_COLORS: Record<string, string> = {
  system: 'blue',
  persona: 'purple',
  task: 'green',
  safety: 'red',
  few_shot: 'orange',
  format: 'cyan',
  chain: 'pink',
};

// Smart prompt templates based on type
const PROMPT_TEMPLATES: Record<string, { template: string; description: string }[]> = {
  system: [
    {
      template: `You are {{assistant_name}}, an AI assistant specialized in {{domain}}.

Your primary responsibilities:
- {{responsibility_1}}
- {{responsibility_2}}
- {{responsibility_3}}

Guidelines:
- Always maintain a {{tone}} tone
- Provide accurate and helpful information
- Ask clarifying questions when needed
- Acknowledge limitations honestly`,
      description: 'General-purpose assistant template',
    },
    {
      template: `You are an expert {{role}} with deep knowledge in {{expertise}}.

When responding:
1. Analyze the request thoroughly
2. Provide structured, actionable advice
3. Include relevant examples when helpful
4. Cite best practices from {{industry}}

Format your responses with clear headings and bullet points.`,
      description: 'Expert advisor template',
    },
  ],
  persona: [
    {
      template: `You are {{character_name}}, a {{profession}} with {{years}} years of experience.

Background:
- Education: {{education}}
- Specialization: {{specialization}}
- Notable achievements: {{achievements}}

Communication style:
- Tone: {{tone}}
- Vocabulary: {{vocabulary_level}}
- Approach: {{approach}}`,
      description: 'Professional persona template',
    },
    {
      template: `Adopt the persona of {{name}}, who embodies these traits:
- Personality: {{personality}}
- Communication style: {{style}}
- Areas of expertise: {{expertise}}
- Unique perspective: {{perspective}}

Stay in character throughout the conversation.`,
      description: 'Character persona template',
    },
  ],
  task: [
    {
      template: `Task: {{task_name}}

Input: {{input_description}}
Expected Output: {{output_description}}

Steps:
1. {{step_1}}
2. {{step_2}}
3. {{step_3}}

Quality criteria:
- {{criterion_1}}
- {{criterion_2}}`,
      description: 'Structured task template',
    },
    {
      template: `Perform the following analysis on the provided {{input_type}}:

1. **Understand**: Parse and comprehend the input
2. **Analyze**: Apply {{analysis_method}} methodology
3. **Synthesize**: Generate {{output_format}}
4. **Validate**: Check against {{validation_criteria}}

Return results in {{format}} format.`,
      description: 'Analysis task template',
    },
  ],
  safety: [
    {
      template: `Safety Guidelines:

NEVER:
- {{prohibited_1}}
- {{prohibited_2}}
- {{prohibited_3}}

ALWAYS:
- {{required_1}}
- {{required_2}}

When uncertain, {{fallback_behavior}}.`,
      description: 'Safety guardrails template',
    },
  ],
  few_shot: [
    {
      template: `Learn from these examples:

Example 1:
Input: {{example_1_input}}
Output: {{example_1_output}}

Example 2:
Input: {{example_2_input}}
Output: {{example_2_output}}

Example 3:
Input: {{example_3_input}}
Output: {{example_3_output}}

Now apply the same pattern to new inputs.`,
      description: 'Three-shot learning template',
    },
  ],
  format: [
    {
      template: `Format your response as follows:

## {{section_1}}
[content]

## {{section_2}}
[content]

## {{section_3}}
[content]

Use {{formatting_style}} throughout.
Maximum length: {{max_length}} words.`,
      description: 'Structured output format template',
    },
    {
      template: `Return a JSON object with this structure:
{
  "{{field_1}}": "description",
  "{{field_2}}": "description",
  "{{field_3}}": ["array", "of", "items"],
  "metadata": {
    "{{meta_field}}": "value"
  }
}`,
      description: 'JSON output format template',
    },
  ],
  chain: [
    {
      template: `This is step {{step_number}} of {{total_steps}} in the workflow.

Previous context: {{previous_output}}

Current task: {{current_task}}

Pass to next step: {{output_for_next}}`,
      description: 'Prompt chain step template',
    },
  ],
};

const MODEL_OPTIONS = [
  { value: 'gpt-4', label: 'GPT-4', provider: 'openai' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', provider: 'openai' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', provider: 'openai' },
  { value: 'claude-3-opus', label: 'Claude 3 Opus', provider: 'anthropic' },
  { value: 'claude-3-sonnet', label: 'Claude 3 Sonnet', provider: 'anthropic' },
  { value: 'claude-3-haiku', label: 'Claude 3 Haiku', provider: 'anthropic' },
  { value: 'gemini-pro', label: 'Gemini Pro', provider: 'google' },
  { value: 'gemini-ultra', label: 'Gemini Ultra', provider: 'google' },
  { value: 'mistral-large', label: 'Mistral Large', provider: 'mistral' },
  { value: 'mistral-medium', label: 'Mistral Medium', provider: 'mistral' },
  { value: 'command-r-plus', label: 'Command R+', provider: 'cohere' },
  { value: 'llama-3-70b', label: 'Llama 3 70B', provider: 'meta' },
];

// =============================================================================
// Step Components
// =============================================================================

function StepIndicator({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  const activeColor = useColorModeValue('brand.500', 'brand.400');
  const inactiveColor = useColorModeValue('gray.200', 'whiteAlpha.200');

  const steps = ['Type', 'Category', 'Providers', 'Build', 'Preview'];

  return (
    <VStack spacing="8px" w="100%">
      <HStack spacing="4px" w="100%">
        {steps.map((step, i) => (
          <Box
            key={step}
            flex="1"
            h="4px"
            bg={i < currentStep ? activeColor : inactiveColor}
            borderRadius="full"
            transition="all 0.3s"
          />
        ))}
      </HStack>
      <HStack justify="space-between" w="100%" px="4px">
        {steps.map((step, i) => (
          <Text
            key={step}
            fontSize="xs"
            fontWeight={i === currentStep - 1 ? '600' : '400'}
            color={i < currentStep ? activeColor : 'gray.500'}
          >
            {step}
          </Text>
        ))}
      </HStack>
    </VStack>
  );
}

function TypeStep({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (type: string) => void;
}) {
  const cardBg = useColorModeValue('white', 'navy.700');
  const selectedBg = useColorModeValue('brand.50', 'brand.900');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.200');

  return (
    <VStack spacing="16px" align="stretch">
      <Text fontSize="lg" fontWeight="600">What type of prompt are you creating?</Text>
      <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing="12px">
        {PROMPT_TYPE_OPTIONS.map((type) => {
          const IconComponent = PROMPT_TYPE_ICONS[type.value] || MdCode;
          const color = PROMPT_TYPE_COLORS[type.value] || 'gray';
          const isSelected = selected === type.value;

          return (
            <Card
              key={type.value}
              p="16px"
              bg={isSelected ? selectedBg : cardBg}
              borderWidth="2px"
              borderColor={isSelected ? `${color}.500` : borderColor}
              cursor="pointer"
              onClick={() => onSelect(type.value)}
              _hover={{ borderColor: `${color}.400` }}
              transition="all 0.2s"
            >
              <HStack spacing="12px">
                <Box
                  p="8px"
                  borderRadius="8px"
                  bg={`${color}.100`}
                >
                  <Icon as={IconComponent} color={`${color}.500`} boxSize="24px" />
                </Box>
                <Box flex="1">
                  <Text fontWeight="600">{type.label}</Text>
                  <Text fontSize="xs" color="gray.500">
                    {getTypeDescription(type.value)}
                  </Text>
                </Box>
                {isSelected && <Icon as={MdCheck} color={`${color}.500`} boxSize="20px" />}
              </HStack>
            </Card>
          );
        })}
      </SimpleGrid>
    </VStack>
  );
}

function getTypeDescription(type: string): string {
  const descriptions: Record<string, string> = {
    system: 'Core instructions for AI behavior',
    persona: 'Define a character or role',
    task: 'Specific task instructions',
    safety: 'Guardrails and restrictions',
    few_shot: 'Learning from examples',
    format: 'Output structure and formatting',
    chain: 'Multi-step prompt workflows',
  };
  return descriptions[type] || '';
}

function CategoryStep({
  selected,
  onSelect,
  categories,
}: {
  selected: string;
  onSelect: (slug: string) => void;
  categories: { slug: string; name: string; description: string; color: string; icon: string }[];
}) {
  const cardBg = useColorModeValue('white', 'navy.700');
  const selectedBg = useColorModeValue('brand.50', 'brand.900');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.200');

  return (
    <VStack spacing="16px" align="stretch">
      <Text fontSize="lg" fontWeight="600">What category best describes this prompt?</Text>
      <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing="12px">
        {categories.map((cat) => {
          const isSelected = selected === cat.slug;

          return (
            <Card
              key={cat.slug}
              p="16px"
              bg={isSelected ? selectedBg : cardBg}
              borderWidth="2px"
              borderColor={isSelected ? 'brand.500' : borderColor}
              cursor="pointer"
              onClick={() => onSelect(cat.slug)}
              _hover={{ borderColor: 'brand.400' }}
              transition="all 0.2s"
            >
              <VStack spacing="8px" align="center">
                <Badge colorScheme={cat.color || 'gray'}>{cat.name}</Badge>
                {cat.description && (
                  <Text fontSize="xs" color="gray.500" textAlign="center" noOfLines={2}>
                    {cat.description}
                  </Text>
                )}
                {isSelected && <Icon as={MdCheck} color="brand.500" boxSize="16px" />}
              </VStack>
            </Card>
          );
        })}
      </SimpleGrid>
      <Button
        variant="ghost"
        size="sm"
        alignSelf="flex-start"
        onClick={() => onSelect('')}
      >
        Skip - No specific category
      </Button>
    </VStack>
  );
}

function ProvidersStep({
  selectedProviders,
  selectedModels,
  onToggleProvider,
  onToggleModel,
}: {
  selectedProviders: string[];
  selectedModels: string[];
  onToggleProvider: (provider: string) => void;
  onToggleModel: (model: string) => void;
}) {
  const cardBg = useColorModeValue('white', 'navy.700');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.200');

  const filteredModels = selectedProviders.length > 0
    ? MODEL_OPTIONS.filter(m => selectedProviders.includes(m.provider))
    : MODEL_OPTIONS;

  return (
    <VStack spacing="24px" align="stretch">
      <Box>
        <Text fontSize="lg" fontWeight="600" mb="12px">
          Which AI providers is this prompt optimized for?
        </Text>
        <Text fontSize="sm" color="gray.500" mb="16px">
          Select all that apply, or leave empty for all providers
        </Text>
        <Wrap spacing="12px">
          {PROVIDER_OPTIONS.map((provider) => {
            const isSelected = selectedProviders.includes(provider.value);
            return (
              <WrapItem key={provider.value}>
                <Button
                  size="md"
                  variant={isSelected ? 'solid' : 'outline'}
                  colorScheme={isSelected ? provider.color : 'gray'}
                  onClick={() => onToggleProvider(provider.value)}
                  leftIcon={isSelected ? <MdCheck /> : undefined}
                >
                  {provider.label}
                </Button>
              </WrapItem>
            );
          })}
        </Wrap>
      </Box>

      <Divider />

      <Box>
        <Text fontSize="lg" fontWeight="600" mb="12px">
          Specific model recommendations (optional)
        </Text>
        <Wrap spacing="8px">
          {filteredModels.map((model) => {
            const isSelected = selectedModels.includes(model.value);
            const providerColor = PROVIDER_OPTIONS.find(p => p.value === model.provider)?.color || 'gray';
            return (
              <WrapItem key={model.value}>
                <Badge
                  px="12px"
                  py="6px"
                  borderRadius="full"
                  cursor="pointer"
                  variant={isSelected ? 'solid' : 'outline'}
                  colorScheme={isSelected ? providerColor : 'gray'}
                  onClick={() => onToggleModel(model.value)}
                >
                  {model.label}
                </Badge>
              </WrapItem>
            );
          })}
        </Wrap>
      </Box>
    </VStack>
  );
}

function BuildStep({
  state,
  onUpdate,
  onUseTemplate,
}: {
  state: GeneratorState;
  onUpdate: (updates: Partial<GeneratorState>) => void;
  onUseTemplate: (template: string) => void;
}) {
  const cardBg = useColorModeValue('white', 'navy.700');
  const codeBg = useColorModeValue('gray.50', 'whiteAlpha.100');
  const { isOpen: showTemplates, onToggle: toggleTemplates } = useDisclosure({ defaultIsOpen: true });
  const { isOpen: showAdvanced, onToggle: toggleAdvanced } = useDisclosure();

  const templates = PROMPT_TEMPLATES[state.promptType] || PROMPT_TEMPLATES.system;

  // Extract variables from prompt text
  const extractedVariables = useMemo(() => {
    const matches = state.promptText.match(/\{\{(\w+)\}\}/g) || [];
    return [...new Set(matches.map(m => m.slice(2, -2)))];
  }, [state.promptText]);

  const addVariable = () => {
    onUpdate({
      variables: [...state.variables, { name: '', description: '', defaultValue: '' }],
    });
  };

  const updateVariable = (index: number, field: keyof PromptVariable, value: string) => {
    const newVars = [...state.variables];
    newVars[index] = { ...newVars[index], [field]: value };
    onUpdate({ variables: newVars });
  };

  const removeVariable = (index: number) => {
    onUpdate({ variables: state.variables.filter((_, i) => i !== index) });
  };

  const addUseCase = () => {
    onUpdate({ useCases: [...state.useCases, ''] });
  };

  const updateUseCase = (index: number, value: string) => {
    const newUseCases = [...state.useCases];
    newUseCases[index] = value;
    onUpdate({ useCases: newUseCases });
  };

  const removeUseCase = (index: number) => {
    onUpdate({ useCases: state.useCases.filter((_, i) => i !== index) });
  };

  return (
    <VStack spacing="24px" align="stretch">
      {/* Templates */}
      <Card p="16px" bg={cardBg}>
        <HStack justify="space-between" cursor="pointer" onClick={toggleTemplates}>
          <HStack>
            <Icon as={MdLightbulb} color="yellow.500" />
            <Text fontWeight="600">Smart Templates</Text>
            <Badge colorScheme="purple">{templates.length}</Badge>
          </HStack>
          <Icon as={showTemplates ? MdExpandLess : MdExpandMore} />
        </HStack>
        <Collapse in={showTemplates}>
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing="12px" mt="16px">
            {templates.map((t, i) => (
              <Card
                key={i}
                p="12px"
                bg={codeBg}
                cursor="pointer"
                onClick={() => onUseTemplate(t.template)}
                _hover={{ bg: 'brand.50' }}
              >
                <Text fontSize="sm" fontWeight="500" mb="4px">{t.description}</Text>
                <Code fontSize="xs" noOfLines={3}>{t.template}</Code>
              </Card>
            ))}
          </SimpleGrid>
        </Collapse>
      </Card>

      {/* Basic Info */}
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing="16px">
        <FormControl isRequired>
          <FormLabel>Prompt Name</FormLabel>
          <Input
            placeholder="e.g., Expert Code Reviewer"
            value={state.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
          />
        </FormControl>
        <FormControl>
          <FormLabel>Description</FormLabel>
          <Input
            placeholder="Brief description of what this prompt does"
            value={state.description}
            onChange={(e) => onUpdate({ description: e.target.value })}
          />
        </FormControl>
      </SimpleGrid>

      {/* Prompt Text */}
      <FormControl isRequired>
        <FormLabel>Prompt Text</FormLabel>
        <Textarea
          placeholder="Enter your prompt text here. Use {{variable_name}} for template variables."
          value={state.promptText}
          onChange={(e) => onUpdate({ promptText: e.target.value })}
          minH="200px"
          fontFamily="mono"
          fontSize="sm"
        />
        <FormHelperText>
          <HStack spacing="8px">
            <Text>Detected variables:</Text>
            {extractedVariables.length > 0 ? (
              extractedVariables.map(v => (
                <Badge key={v} colorScheme="purple" variant="outline">
                  {`{{${v}}}`}
                </Badge>
              ))
            ) : (
              <Text color="gray.500">None</Text>
            )}
          </HStack>
        </FormHelperText>
      </FormControl>

      {/* Variables */}
      {extractedVariables.length > 0 && (
        <Card p="16px" bg={cardBg}>
          <HStack justify="space-between" mb="12px">
            <Text fontWeight="600">Variable Definitions</Text>
            <Button size="sm" leftIcon={<MdAdd />} onClick={addVariable}>
              Add Manual Variable
            </Button>
          </HStack>
          <VStack spacing="12px" align="stretch">
            {extractedVariables.map((varName) => {
              const existingVar = state.variables.find(v => v.name === varName);
              return (
                <HStack key={varName} spacing="12px">
                  <Badge colorScheme="purple" minW="100px">{varName}</Badge>
                  <Input
                    size="sm"
                    placeholder="Description"
                    value={existingVar?.description || ''}
                    onChange={(e) => {
                      if (existingVar) {
                        updateVariable(state.variables.indexOf(existingVar), 'description', e.target.value);
                      } else {
                        onUpdate({
                          variables: [...state.variables, { name: varName, description: e.target.value, defaultValue: '' }],
                        });
                      }
                    }}
                  />
                  <Input
                    size="sm"
                    placeholder="Default value"
                    value={existingVar?.defaultValue || ''}
                    onChange={(e) => {
                      if (existingVar) {
                        updateVariable(state.variables.indexOf(existingVar), 'defaultValue', e.target.value);
                      } else {
                        onUpdate({
                          variables: [...state.variables, { name: varName, description: '', defaultValue: e.target.value }],
                        });
                      }
                    }}
                  />
                </HStack>
              );
            })}
          </VStack>
        </Card>
      )}

      {/* Use Cases */}
      <Card p="16px" bg={cardBg}>
        <HStack justify="space-between" mb="12px">
          <Text fontWeight="600">Use Cases (optional)</Text>
          <Button size="sm" leftIcon={<MdAdd />} onClick={addUseCase}>
            Add Use Case
          </Button>
        </HStack>
        <VStack spacing="8px" align="stretch">
          {state.useCases.map((uc, i) => (
            <HStack key={i}>
              <Input
                size="sm"
                placeholder="e.g., Reviewing pull requests"
                value={uc}
                onChange={(e) => updateUseCase(i, e.target.value)}
              />
              <IconButton
                aria-label="Remove"
                icon={<MdDelete />}
                size="sm"
                variant="ghost"
                colorScheme="red"
                onClick={() => removeUseCase(i)}
              />
            </HStack>
          ))}
        </VStack>
      </Card>

      {/* Advanced Settings */}
      <Card p="16px" bg={cardBg}>
        <HStack justify="space-between" cursor="pointer" onClick={toggleAdvanced}>
          <Text fontWeight="600">Advanced Settings</Text>
          <Icon as={showAdvanced ? MdExpandLess : MdExpandMore} />
        </HStack>
        <Collapse in={showAdvanced}>
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing="16px" mt="16px">
            <FormControl>
              <FormLabel>Recommended Temperature</FormLabel>
              <HStack>
                <Slider
                  value={state.temperature || 0.7}
                  min={0}
                  max={2}
                  step={0.1}
                  onChange={(v) => onUpdate({ temperature: v })}
                  flex="1"
                >
                  <SliderTrack>
                    <SliderFilledTrack />
                  </SliderTrack>
                  <SliderThumb />
                </Slider>
                <Badge minW="40px" textAlign="center">
                  {state.temperature?.toFixed(1) || '0.7'}
                </Badge>
              </HStack>
              <FormHelperText>Lower = more focused, Higher = more creative</FormHelperText>
            </FormControl>
            <FormControl>
              <FormLabel>Recommended Max Tokens</FormLabel>
              <NumberInput
                value={state.maxTokens || ''}
                onChange={(_, v) => onUpdate({ maxTokens: v || null })}
                min={1}
                max={128000}
              >
                <NumberInputField placeholder="e.g., 4096" />
                <NumberInputStepper>
                  <NumberIncrementStepper />
                  <NumberDecrementStepper />
                </NumberInputStepper>
              </NumberInput>
            </FormControl>
          </SimpleGrid>
        </Collapse>
      </Card>
    </VStack>
  );
}

interface AnalysisResult {
  overallScore: number;
  strengths: string[];
  improvements: {
    category: string;
    originalText: string;
    suggestedText: string;
    explanation: string;
    severity: string;
  }[];
  tokenEfficiency: string;
}

function PreviewStep({
  state,
  onSave,
  isSaving,
  onTest,
  onAnalyze,
  isTesting,
  isAnalyzing,
  testResponse,
  analysisResult,
}: {
  state: GeneratorState;
  onSave: () => void;
  isSaving: boolean;
  onTest: (testInput: string) => void;
  onAnalyze: () => void;
  isTesting: boolean;
  isAnalyzing: boolean;
  testResponse: string | null;
  analysisResult: AnalysisResult | null;
}) {
  const cardBg = useColorModeValue('white', 'navy.700');
  const codeBg = useColorModeValue('gray.50', 'whiteAlpha.100');
  const [testInput, setTestInput] = useState('');
  const toast = useToast();

  // Limits
  const LIMITS = {
    maxPromptLength: 8000,
    maxTestInputLength: 500,
    testsPerHour: 20,
    analysesPerHour: 10,
  };

  // Render prompt with default variable values
  const renderedPrompt = useMemo(() => {
    let text = state.promptText;
    state.variables.forEach(v => {
      if (v.defaultValue) {
        text = text.replace(new RegExp(`\\{\\{${v.name}\\}\\}`, 'g'), v.defaultValue);
      }
    });
    return text;
  }, [state.promptText, state.variables]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(renderedPrompt);
    toast({
      title: 'Copied to clipboard',
      status: 'success',
      duration: 2000,
    });
  };

  const promptLength = state.promptText.length;
  const isPromptTooLong = promptLength > LIMITS.maxPromptLength;
  const isTestInputTooLong = testInput.length > LIMITS.maxTestInputLength;
  const isValid = state.name.trim() && state.promptText.trim() && !isPromptTooLong;
  const canTest = testInput.trim() && !isTestInputTooLong && !isPromptTooLong;

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'important': return 'red';
      case 'warning': return 'orange';
      default: return 'blue';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'clarity': return '🔍';
      case 'specificity': return '🎯';
      case 'structure': return '📐';
      case 'safety': return '🛡️';
      case 'efficiency': return '⚡';
      default: return '💡';
    }
  };

  return (
    <VStack spacing="24px" align="stretch">
      {/* Limits Banner */}
      <Alert status="info" borderRadius="8px">
        <AlertIcon />
        <Box>
          <Text fontWeight="600" fontSize="sm">Testing Limits</Text>
          <Text fontSize="xs">
            {LIMITS.testsPerHour} tests/hr • {LIMITS.analysesPerHour} analyses/hr •
            Prompt: {LIMITS.maxPromptLength.toLocaleString()} chars max •
            Test input: {LIMITS.maxTestInputLength} chars max
          </Text>
        </Box>
      </Alert>

      {/* Summary */}
      <SimpleGrid columns={{ base: 1, md: 4 }} spacing="12px">
        <Card p="12px" bg={cardBg}>
          <Text fontSize="xs" color="gray.500">Type</Text>
          <Badge colorScheme={PROMPT_TYPE_COLORS[state.promptType] || 'gray'} mt="4px">
            {PROMPT_TYPE_OPTIONS.find(t => t.value === state.promptType)?.label || state.promptType}
          </Badge>
        </Card>
        <Card p="12px" bg={cardBg}>
          <Text fontSize="xs" color="gray.500">Providers</Text>
          <Text fontSize="sm" fontWeight="600" mt="4px">
            {state.providers.length > 0 ? state.providers.join(', ') : 'All'}
          </Text>
        </Card>
        <Card p="12px" bg={cardBg}>
          <Text fontSize="xs" color="gray.500">Variables</Text>
          <Text fontSize="sm" fontWeight="600" mt="4px">
            {state.variables.length || 'None'}
          </Text>
        </Card>
        <Card p="12px" bg={cardBg}>
          <Text fontSize="xs" color="gray.500">Length</Text>
          <Text
            fontSize="sm"
            fontWeight="600"
            mt="4px"
            color={isPromptTooLong ? 'red.500' : undefined}
          >
            {promptLength.toLocaleString()} / {LIMITS.maxPromptLength.toLocaleString()}
          </Text>
        </Card>
      </SimpleGrid>

      {/* Rendered Preview */}
      <Card p="16px" bg={cardBg}>
        <HStack justify="space-between" mb="12px">
          <Text fontWeight="600">{state.name || 'Untitled Prompt'}</Text>
          <HStack>
            <Tooltip label="Analyze with AI">
              <Button
                size="sm"
                variant="outline"
                colorScheme="purple"
                leftIcon={<MdLightbulb />}
                onClick={onAnalyze}
                isLoading={isAnalyzing}
                isDisabled={isPromptTooLong}
              >
                Analyze
              </Button>
            </Tooltip>
            <Tooltip label="Copy to clipboard">
              <IconButton
                aria-label="Copy"
                icon={<MdContentCopy />}
                size="sm"
                variant="ghost"
                onClick={copyToClipboard}
              />
            </Tooltip>
          </HStack>
        </HStack>
        {state.description && (
          <Text fontSize="sm" color="gray.500" mb="12px">{state.description}</Text>
        )}
        <Code
          display="block"
          whiteSpace="pre-wrap"
          p="16px"
          borderRadius="8px"
          bg={codeBg}
          fontSize="sm"
          maxH="250px"
          overflow="auto"
        >
          {renderedPrompt}
        </Code>
        <Box mt="12px">
          <TokenCalculator text={renderedPrompt} compact />
        </Box>
      </Card>

      {/* Analysis Results */}
      {analysisResult && (
        <Card p="16px" bg={cardBg} borderColor="purple.200" borderWidth="1px">
          <HStack justify="space-between" mb="12px">
            <HStack>
              <Icon as={MdLightbulb} color="purple.500" />
              <Text fontWeight="600">AI Analysis</Text>
            </HStack>
            <HStack>
              <Text fontSize="sm" color="gray.500">Score:</Text>
              <Badge
                colorScheme={analysisResult.overallScore >= 80 ? 'green' : analysisResult.overallScore >= 60 ? 'yellow' : 'red'}
                fontSize="md"
                px="8px"
              >
                {analysisResult.overallScore}/100
              </Badge>
            </HStack>
          </HStack>

          {analysisResult.strengths.length > 0 && (
            <Box mb="12px">
              <Text fontSize="sm" fontWeight="500" color="green.600" mb="4px">Strengths</Text>
              <VStack align="stretch" spacing="4px">
                {analysisResult.strengths.map((s, i) => (
                  <Text key={i} fontSize="sm">✓ {s}</Text>
                ))}
              </VStack>
            </Box>
          )}

          {analysisResult.improvements.length > 0 && (
            <Box>
              <Text fontSize="sm" fontWeight="500" color="orange.600" mb="8px">Suggested Improvements</Text>
              <VStack align="stretch" spacing="12px">
                {analysisResult.improvements.map((imp, i) => (
                  <Box
                    key={i}
                    p="12px"
                    bg={codeBg}
                    borderRadius="8px"
                    borderLeftWidth="3px"
                    borderLeftColor={`${getSeverityColor(imp.severity)}.400`}
                  >
                    <HStack mb="8px">
                      <Text fontSize="lg">{getCategoryIcon(imp.category)}</Text>
                      <Badge colorScheme={getSeverityColor(imp.severity)} size="sm">
                        {imp.category}
                      </Badge>
                    </HStack>
                    {imp.originalText && (
                      <Box mb="8px">
                        <Text fontSize="xs" color="gray.500">Original:</Text>
                        <Code fontSize="xs" colorScheme="red" p="4px">{imp.originalText}</Code>
                      </Box>
                    )}
                    {imp.suggestedText && (
                      <Box mb="8px">
                        <Text fontSize="xs" color="gray.500">Suggested:</Text>
                        <Code fontSize="xs" colorScheme="green" p="4px">{imp.suggestedText}</Code>
                      </Box>
                    )}
                    <Text fontSize="sm" color="gray.600">{imp.explanation}</Text>
                  </Box>
                ))}
              </VStack>
            </Box>
          )}
        </Card>
      )}

      {/* Test Area */}
      <Card p="16px" bg={cardBg}>
        <HStack justify="space-between" mb="12px">
          <HStack>
            <Icon as={MdPlayArrow} color="green.500" />
            <Text fontWeight="600">Test with AI</Text>
          </HStack>
          <Text fontSize="xs" color="gray.500">
            One-shot test • {LIMITS.maxTestInputLength} char limit
          </Text>
        </HStack>

        <FormControl mb="12px">
          <FormLabel fontSize="sm">
            Sample User Input
            <Badge ml="8px" colorScheme={isTestInputTooLong ? 'red' : 'gray'} fontSize="xs">
              {testInput.length}/{LIMITS.maxTestInputLength}
            </Badge>
          </FormLabel>
          <Textarea
            placeholder="Enter a realistic sample message that a user would send to this AI agent..."
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
            minH="80px"
            fontSize="sm"
            isInvalid={isTestInputTooLong}
          />
          <FormHelperText fontSize="xs">
            This should be a realistic test case, not a general chat message
          </FormHelperText>
        </FormControl>

        <Button
          colorScheme="green"
          leftIcon={<MdPlayArrow />}
          onClick={() => onTest(testInput)}
          isLoading={isTesting}
          isDisabled={!canTest}
          mb="12px"
        >
          Run Test
        </Button>

        {testResponse && (
          <Box>
            <Text fontSize="sm" fontWeight="500" mb="4px">AI Response:</Text>
            <Code
              display="block"
              whiteSpace="pre-wrap"
              p="12px"
              borderRadius="8px"
              bg={codeBg}
              fontSize="sm"
              maxH="200px"
              overflow="auto"
            >
              {testResponse}
            </Code>
          </Box>
        )}
      </Card>

      {/* Save Button */}
      <Flex justify="flex-end">
        <Button
          colorScheme="brand"
          size="lg"
          leftIcon={<MdSave />}
          onClick={onSave}
          isLoading={isSaving}
          isDisabled={!isValid}
        >
          Save to Library
        </Button>
      </Flex>
    </VStack>
  );
}

// =============================================================================
// Main Component
// =============================================================================

interface PromptGeneratorProps {
  onSaved?: () => void;
}

export default function PromptGenerator({ onSaved }: PromptGeneratorProps) {
  const [step, setStep] = useState(1);
  const [state, setState] = useState<GeneratorState>(INITIAL_STATE);
  const [testResponse, setTestResponse] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const toast = useToast();

  const { data: categoriesData } = useQuery(GET_PROMPT_CATEGORIES, {
    variables: { activeOnly: true },
  });
  const categories = categoriesData?.promptCategories || [];

  // Test prompt mutation
  const [testPrompt, { loading: testing }] = useMutation(TEST_SYSTEM_PROMPT, {
    onCompleted: (data) => {
      if (data?.testSystemPrompt?.success) {
        setTestResponse(data.testSystemPrompt.response);
        toast({
          title: 'Test complete',
          description: `Used ${data.testSystemPrompt.inputTokens} input + ${data.testSystemPrompt.outputTokens} output tokens`,
          status: 'success',
          duration: 3000,
        });
      } else {
        toast({
          title: 'Test failed',
          description: data?.testSystemPrompt?.error || 'Unknown error',
          status: 'error',
          duration: 5000,
        });
      }
    },
    onError: (error) => {
      toast({
        title: 'Test failed',
        description: error.message,
        status: 'error',
        duration: 5000,
      });
    },
  });

  // Analyze prompt mutation
  const [analyzePrompt, { loading: analyzing }] = useMutation(ANALYZE_SYSTEM_PROMPT, {
    onCompleted: (data) => {
      if (data?.analyzeSystemPrompt?.success) {
        setAnalysisResult({
          overallScore: data.analyzeSystemPrompt.overallScore,
          strengths: data.analyzeSystemPrompt.strengths || [],
          improvements: data.analyzeSystemPrompt.improvements || [],
          tokenEfficiency: data.analyzeSystemPrompt.tokenEfficiency,
        });
        toast({
          title: 'Analysis complete',
          description: `Score: ${data.analyzeSystemPrompt.overallScore}/100`,
          status: 'success',
          duration: 3000,
        });
      } else {
        toast({
          title: 'Analysis failed',
          description: data?.analyzeSystemPrompt?.error || 'Unknown error',
          status: 'error',
          duration: 5000,
        });
      }
    },
    onError: (error) => {
      toast({
        title: 'Analysis failed',
        description: error.message,
        status: 'error',
        duration: 5000,
      });
    },
  });

  const [createPrompt, { loading: saving }] = useMutation(CREATE_SYSTEM_PROMPT, {
    onCompleted: (data) => {
      if (data?.createSystemPrompt?.success) {
        toast({
          title: 'Prompt created!',
          description: 'Your prompt has been saved to the library.',
          status: 'success',
          duration: 5000,
        });
        // Reset state and notify parent
        setState(INITIAL_STATE);
        setStep(1);
        onSaved?.();
      } else {
        toast({
          title: 'Error creating prompt',
          description: data?.createSystemPrompt?.errors?.[0] || 'Unknown error',
          status: 'error',
          duration: 5000,
        });
      }
    },
    onError: (error) => {
      toast({
        title: 'Error creating prompt',
        description: error.message,
        status: 'error',
        duration: 5000,
      });
    },
  });

  const updateState = useCallback((updates: Partial<GeneratorState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const handleSave = () => {
    const variableDefaults: Record<string, string> = {};
    const variableDescriptions: Record<string, string> = {};

    state.variables.forEach(v => {
      if (v.name) {
        if (v.defaultValue) variableDefaults[v.name] = v.defaultValue;
        if (v.description) variableDescriptions[v.name] = v.description;
      }
    });

    createPrompt({
      variables: {
        input: {
          name: state.name,
          description: state.description,
          promptText: state.promptText,
          promptType: state.promptType || 'system',
          categoryId: categories.find((c: { slug: string }) => c.slug === state.categorySlug)?.id,
          compatibleProviders: state.providers,
          compatibleModels: state.models,
          recommendedTemperature: state.temperature,
          recommendedMaxTokens: state.maxTokens,
          variableDefaults,
          variableDescriptions,
          useCases: state.useCases.filter(Boolean),
          visibility: state.visibility,
        },
      },
    });
  };

  const canProceed = () => {
    switch (step) {
      case 1: return !!state.promptType;
      case 2: return true; // Category is optional
      case 3: return true; // Providers are optional
      case 4: return !!state.name.trim() && !!state.promptText.trim();
      default: return true;
    }
  };

  const nextStep = () => {
    if (step < 5 && canProceed()) {
      setStep(step + 1);
    }
  };

  const prevStep = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleUseTemplate = (template: string) => {
    updateState({ promptText: template });
  };

  const toggleProvider = (provider: string) => {
    const newProviders = state.providers.includes(provider)
      ? state.providers.filter(p => p !== provider)
      : [...state.providers, provider];
    updateState({ providers: newProviders });
  };

  const toggleModel = (model: string) => {
    const newModels = state.models.includes(model)
      ? state.models.filter(m => m !== model)
      : [...state.models, model];
    updateState({ models: newModels });
  };

  return (
    <VStack spacing="24px" align="stretch">
      {/* Header */}
      <Card p="20px">
        <HStack justify="space-between" mb="16px">
          <HStack>
            <Icon as={MdAutoAwesome} color="brand.500" boxSize="24px" />
            <Text fontSize="lg" fontWeight="600">Interactive Prompt Generator</Text>
          </HStack>
          <Button
            size="sm"
            variant="ghost"
            leftIcon={<MdRefresh />}
            onClick={() => {
              setState(INITIAL_STATE);
              setStep(1);
            }}
          >
            Start Over
          </Button>
        </HStack>
        <StepIndicator currentStep={step} totalSteps={5} />
      </Card>

      {/* Step Content */}
      <Card p="24px" minH="400px">
        {step === 1 && (
          <TypeStep
            selected={state.promptType}
            onSelect={(type) => updateState({ promptType: type })}
          />
        )}
        {step === 2 && (
          <CategoryStep
            selected={state.categorySlug}
            onSelect={(slug) => updateState({ categorySlug: slug })}
            categories={categories}
          />
        )}
        {step === 3 && (
          <ProvidersStep
            selectedProviders={state.providers}
            selectedModels={state.models}
            onToggleProvider={toggleProvider}
            onToggleModel={toggleModel}
          />
        )}
        {step === 4 && (
          <BuildStep
            state={state}
            onUpdate={updateState}
            onUseTemplate={handleUseTemplate}
          />
        )}
        {step === 5 && (
          <PreviewStep
            state={state}
            onSave={handleSave}
            isSaving={saving}
            onTest={(testInput) => {
              // Render with variable defaults for testing
              let renderedPrompt = state.promptText;
              state.variables.forEach(v => {
                if (v.defaultValue) {
                  renderedPrompt = renderedPrompt.replace(new RegExp(`\\{\\{${v.name}\\}\\}`, 'g'), v.defaultValue);
                }
              });
              testPrompt({
                variables: {
                  systemPrompt: renderedPrompt,
                  userMessage: testInput,
                },
              });
            }}
            onAnalyze={() => {
              analyzePrompt({
                variables: {
                  promptText: state.promptText,
                  promptType: state.promptType || 'system',
                  targetProviders: state.providers.length > 0 ? state.providers : null,
                },
              });
            }}
            isTesting={testing}
            isAnalyzing={analyzing}
            testResponse={testResponse}
            analysisResult={analysisResult}
          />
        )}
      </Card>

      {/* Navigation */}
      <HStack justify="space-between">
        <Button
          leftIcon={<MdArrowBack />}
          variant="ghost"
          onClick={prevStep}
          isDisabled={step === 1}
        >
          Back
        </Button>
        {step < 5 && (
          <Button
            rightIcon={<MdArrowForward />}
            colorScheme="brand"
            onClick={nextStep}
            isDisabled={!canProceed()}
          >
            {step === 4 ? 'Preview' : 'Next'}
          </Button>
        )}
      </HStack>
    </VStack>
  );
}
