'use client';

import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Textarea,
  Input,
  FormControl,
  FormLabel,
  FormHelperText,
  Badge,
  Icon,
  Divider,
  Select,
  useColorModeValue,
  SimpleGrid,
  Flex,
  Spinner,
  Code,
  Tag,
  TagLabel,
  TagCloseButton,
  Wrap,
  WrapItem,
  IconButton,
  Tooltip,
  Alert,
  AlertIcon,
  Collapse,
  useDisclosure,
} from '@chakra-ui/react';
import { useState, useMemo } from 'react';
import {
  MdAutoAwesome,
  MdLightbulb,
  MdContentCopy,
  MdRefresh,
  MdCheck,
  MdAdd,
  MdEdit,
  MdSave,
  MdExpandMore,
  MdExpandLess,
} from 'react-icons/md';
import TokenCalculator from './TokenCalculator';

// Prompt templates by use case
const PROMPT_TEMPLATES = {
  customer_service: {
    name: 'Customer Service Agent',
    description: 'Helpful support agent for customer inquiries',
    template: `You are a helpful customer service representative for {{company_name}}.

Your role is to:
- Answer customer questions accurately and professionally
- Help resolve issues with empathy and patience
- Escalate complex issues to human agents when needed
- Never make promises about refunds or policy exceptions without approval

Tone: {{tone}}
Language: {{language}}

When you don't know an answer, say "I'll need to check with my team and get back to you" rather than guessing.`,
    variables: ['company_name', 'tone', 'language'],
    suggestions: {
      tone: ['Professional and friendly', 'Casual and approachable', 'Formal and precise'],
      language: ['English', 'Spanish', 'French', 'German'],
    },
  },
  code_assistant: {
    name: 'Code Assistant',
    description: 'Technical coding helper with best practices',
    template: `You are an expert software engineer specializing in {{languages}}.

Guidelines:
- Write clean, maintainable, and well-documented code
- Follow {{style_guide}} coding standards
- Explain your reasoning and trade-offs
- Consider security implications in all suggestions
- Suggest tests for any code you write

When asked to modify existing code:
1. First understand the current implementation
2. Explain what changes you'll make and why
3. Provide the updated code with clear comments

Avoid: {{avoid_patterns}}`,
    variables: ['languages', 'style_guide', 'avoid_patterns'],
    suggestions: {
      languages: ['Python, TypeScript', 'JavaScript, React', 'Go, Rust', 'Java, Kotlin'],
      style_guide: ['Google', 'Airbnb', 'PEP 8', 'Standard'],
      avoid_patterns: ['eval(), exec()', 'SQL string concatenation', 'hardcoded secrets'],
    },
  },
  data_analyst: {
    name: 'Data Analyst',
    description: 'Analytical assistant for data exploration',
    template: `You are a data analyst assistant helping users understand and explore data.

Your capabilities:
- Write SQL queries for {{database_type}}
- Create data visualizations using {{viz_tools}}
- Perform statistical analysis
- Explain findings in plain language

Data handling rules:
- Never expose raw PII in outputs
- Aggregate data when possible
- Note data quality issues you observe
- Cite sources and explain methodology

Output format: {{output_format}}`,
    variables: ['database_type', 'viz_tools', 'output_format'],
    suggestions: {
      database_type: ['PostgreSQL', 'MySQL', 'BigQuery', 'Snowflake'],
      viz_tools: ['Python (matplotlib, seaborn)', 'JavaScript (D3, Chart.js)', 'Tableau'],
      output_format: ['Markdown with code blocks', 'JSON structured output', 'Plain text summary'],
    },
  },
  content_writer: {
    name: 'Content Writer',
    description: 'Creative writing assistant for marketing and content',
    template: `You are a skilled content writer for {{brand_name}}.

Brand voice: {{brand_voice}}
Target audience: {{target_audience}}

Content guidelines:
- Match the brand's tone and style
- Use engaging, clear language
- Include relevant keywords naturally
- Create scannable content with headers and bullets
- End with clear calls to action when appropriate

Topics to avoid: {{avoid_topics}}
Required disclaimers: {{disclaimers}}`,
    variables: ['brand_name', 'brand_voice', 'target_audience', 'avoid_topics', 'disclaimers'],
    suggestions: {
      brand_voice: ['Professional and authoritative', 'Friendly and casual', 'Innovative and bold'],
      target_audience: ['Enterprise B2B', 'Small business owners', 'Developers', 'General consumers'],
    },
  },
  research_assistant: {
    name: 'Research Assistant',
    description: 'Academic and business research helper',
    template: `You are a research assistant helping with {{research_domain}} research.

Research standards:
- Cite sources whenever possible
- Distinguish between facts and opinions
- Note confidence levels in findings
- Identify gaps in available information
- Follow {{citation_style}} citation format

Ethical guidelines:
- Maintain objectivity
- Acknowledge limitations
- Respect intellectual property
- Flag potential biases

Output preferences: {{output_style}}`,
    variables: ['research_domain', 'citation_style', 'output_style'],
    suggestions: {
      research_domain: ['Market research', 'Academic literature', 'Competitive analysis', 'Technical research'],
      citation_style: ['APA', 'MLA', 'Chicago', 'IEEE'],
      output_style: ['Executive summary', 'Detailed report', 'Bullet points', 'Q&A format'],
    },
  },
};

interface PromptBuilderProps {
  onSave?: (prompt: { name: string; content: string; variables: string[] }) => void;
  initialPrompt?: string;
}

export default function PromptBuilder({ onSave, initialPrompt }: PromptBuilderProps) {
  const cardBg = useColorModeValue('white', 'navy.800');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.200');
  const codeBg = useColorModeValue('gray.50', 'whiteAlpha.100');

  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [customDescription, setCustomDescription] = useState('');
  const [promptName, setPromptName] = useState('');
  const [promptContent, setPromptContent] = useState(initialPrompt || '');
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [customVariables, setCustomVariables] = useState<string[]>([]);
  const [newVariable, setNewVariable] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const { isOpen: showAdvanced, onToggle: toggleAdvanced } = useDisclosure();

  const template = selectedTemplate
    ? PROMPT_TEMPLATES[selectedTemplate as keyof typeof PROMPT_TEMPLATES]
    : null;

  // Extract variables from prompt content
  const extractedVariables = useMemo(() => {
    const matches = promptContent.match(/\{\{(\w+)\}\}/g) || [];
    return [...new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, '')))];
  }, [promptContent]);

  const allVariables = useMemo(() => {
    return [...new Set([...extractedVariables, ...customVariables])];
  }, [extractedVariables, customVariables]);

  // Generate preview with filled variables
  const previewContent = useMemo(() => {
    let content = promptContent;
    Object.entries(variableValues).forEach(([key, value]) => {
      content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || `{{${key}}}`);
    });
    return content;
  }, [promptContent, variableValues]);

  const handleTemplateSelect = (templateKey: string) => {
    setSelectedTemplate(templateKey);
    if (templateKey && PROMPT_TEMPLATES[templateKey as keyof typeof PROMPT_TEMPLATES]) {
      const t = PROMPT_TEMPLATES[templateKey as keyof typeof PROMPT_TEMPLATES];
      setPromptName(t.name);
      setPromptContent(t.template);
      setVariableValues({});
    }
  };

  const handleGenerateFromDescription = () => {
    if (!customDescription.trim()) return;

    setIsGenerating(true);
    // Simulate LLM generation (in production, this would call an API)
    setTimeout(() => {
      const generatedPrompt = `You are an AI assistant designed to ${customDescription.toLowerCase()}.

Your core responsibilities:
- Fulfill user requests accurately and helpfully
- Maintain professional and appropriate conduct
- Ask clarifying questions when needed
- Admit limitations and uncertainties

Guidelines:
- Be concise but thorough
- Prioritize user safety and privacy
- Follow organizational policies
- Escalate when appropriate

Context: {{context}}
User role: {{user_role}}`;

      setPromptContent(generatedPrompt);
      setPromptName(`${customDescription.slice(0, 30)}...`);
      setIsGenerating(false);
    }, 1500);
  };

  const handleAddVariable = () => {
    if (newVariable && !allVariables.includes(newVariable)) {
      setCustomVariables([...customVariables, newVariable]);
      setNewVariable('');
    }
  };

  const handleRemoveVariable = (variable: string) => {
    setCustomVariables(customVariables.filter((v) => v !== variable));
    const newValues = { ...variableValues };
    delete newValues[variable];
    setVariableValues(newValues);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(previewContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = () => {
    if (onSave) {
      onSave({
        name: promptName,
        content: promptContent,
        variables: allVariables,
      });
    }
  };

  return (
    <Box>
      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing="24px">
        {/* Builder Panel */}
        <Box
          p="20px"
          bg={cardBg}
          borderRadius="lg"
          border="1px solid"
          borderColor={borderColor}
        >
          <HStack mb="16px">
            <Icon as={MdAutoAwesome} color="brand.500" boxSize="24px" />
            <Text fontWeight="600" fontSize="lg">
              Prompt Builder
            </Text>
          </HStack>

          <VStack spacing="16px" align="stretch">
            {/* Quick Start from Template */}
            <FormControl>
              <FormLabel fontSize="sm">Start from Template</FormLabel>
              <Select
                size="sm"
                value={selectedTemplate}
                onChange={(e) => handleTemplateSelect(e.target.value)}
                placeholder="Choose a template..."
              >
                {Object.entries(PROMPT_TEMPLATES).map(([key, t]) => (
                  <option key={key} value={key}>
                    {t.name} - {t.description}
                  </option>
                ))}
              </Select>
            </FormControl>

            <HStack>
              <Divider />
              <Text fontSize="xs" color="gray.500" whiteSpace="nowrap">
                or describe your needs
              </Text>
              <Divider />
            </HStack>

            {/* AI Generation from Description */}
            <FormControl>
              <FormLabel fontSize="sm">Describe Your Agent</FormLabel>
              <HStack>
                <Input
                  size="sm"
                  value={customDescription}
                  onChange={(e) => setCustomDescription(e.target.value)}
                  placeholder="e.g., help customers with billing questions"
                />
                <Button
                  size="sm"
                  colorScheme="brand"
                  leftIcon={<Icon as={MdLightbulb} />}
                  onClick={handleGenerateFromDescription}
                  isLoading={isGenerating}
                  loadingText="Generating"
                >
                  Generate
                </Button>
              </HStack>
              <FormHelperText fontSize="xs">
                Describe what your AI agent should do
              </FormHelperText>
            </FormControl>

            <Divider />

            {/* Prompt Name */}
            <FormControl>
              <FormLabel fontSize="sm">Prompt Name</FormLabel>
              <Input
                size="sm"
                value={promptName}
                onChange={(e) => setPromptName(e.target.value)}
                placeholder="My Custom Prompt"
              />
            </FormControl>

            {/* Prompt Content Editor */}
            <FormControl>
              <FormLabel fontSize="sm">Prompt Content</FormLabel>
              <Textarea
                value={promptContent}
                onChange={(e) => setPromptContent(e.target.value)}
                fontFamily="mono"
                fontSize="sm"
                rows={12}
                bg={codeBg}
                placeholder="Enter your system prompt here...

Use {{variable_name}} for dynamic values."
              />
            </FormControl>

            {/* Variables */}
            {allVariables.length > 0 && (
              <Box>
                <Text fontSize="sm" fontWeight="500" mb="8px">
                  Template Variables
                </Text>
                <VStack align="stretch" spacing="8px">
                  {allVariables.map((variable) => (
                    <HStack key={variable}>
                      <Badge colorScheme="purple" fontSize="xs" minW="100px">
                        {`{{${variable}}}`}
                      </Badge>
                      <Input
                        size="sm"
                        flex="1"
                        value={variableValues[variable] || ''}
                        onChange={(e) =>
                          setVariableValues({ ...variableValues, [variable]: e.target.value })
                        }
                        placeholder={`Enter ${variable.replace(/_/g, ' ')}`}
                      />
                      {template?.suggestions?.[variable as keyof typeof template.suggestions] && (
                        <Select
                          size="sm"
                          maxW="200px"
                          placeholder="Suggestions"
                          onChange={(e) => {
                            if (e.target.value) {
                              setVariableValues({ ...variableValues, [variable]: e.target.value });
                            }
                          }}
                        >
                          {(template.suggestions[variable as keyof typeof template.suggestions] as string[])?.map(
                            (s: string) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            )
                          )}
                        </Select>
                      )}
                      {customVariables.includes(variable) && (
                        <IconButton
                          aria-label="Remove"
                          icon={<Icon as={MdAdd} transform="rotate(45deg)" />}
                          size="sm"
                          variant="ghost"
                          colorScheme="red"
                          onClick={() => handleRemoveVariable(variable)}
                        />
                      )}
                    </HStack>
                  ))}
                </VStack>
              </Box>
            )}

            {/* Add Custom Variable */}
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<Icon as={showAdvanced ? MdExpandLess : MdExpandMore} />}
              onClick={toggleAdvanced}
            >
              Advanced Options
            </Button>

            <Collapse in={showAdvanced}>
              <VStack align="stretch" spacing="12px" p="12px" bg={codeBg} borderRadius="md">
                <FormControl>
                  <FormLabel fontSize="xs">Add Custom Variable</FormLabel>
                  <HStack>
                    <Input
                      size="sm"
                      value={newVariable}
                      onChange={(e) => setNewVariable(e.target.value.replace(/\s/g, '_'))}
                      placeholder="variable_name"
                    />
                    <Button size="sm" onClick={handleAddVariable}>
                      Add
                    </Button>
                  </HStack>
                </FormControl>
              </VStack>
            </Collapse>

            {/* Token Info */}
            <TokenCalculator text={previewContent} compact />
          </VStack>
        </Box>

        {/* Preview Panel */}
        <Box
          p="20px"
          bg={cardBg}
          borderRadius="lg"
          border="1px solid"
          borderColor={borderColor}
        >
          <Flex justify="space-between" align="center" mb="16px">
            <HStack>
              <Icon as={MdEdit} color="brand.500" boxSize="24px" />
              <Text fontWeight="600" fontSize="lg">
                Preview
              </Text>
            </HStack>
            <HStack>
              <Tooltip label={copied ? 'Copied!' : 'Copy to clipboard'}>
                <IconButton
                  aria-label="Copy"
                  icon={<Icon as={copied ? MdCheck : MdContentCopy} />}
                  size="sm"
                  variant="ghost"
                  onClick={handleCopy}
                  colorScheme={copied ? 'green' : 'gray'}
                />
              </Tooltip>
              {onSave && (
                <Button
                  size="sm"
                  colorScheme="brand"
                  leftIcon={<Icon as={MdSave} />}
                  onClick={handleSave}
                  isDisabled={!promptName || !promptContent}
                >
                  Save Prompt
                </Button>
              )}
            </HStack>
          </Flex>

          {/* Preview Content */}
          <Box
            p="16px"
            bg={codeBg}
            borderRadius="md"
            fontFamily="mono"
            fontSize="sm"
            whiteSpace="pre-wrap"
            maxH="500px"
            overflowY="auto"
          >
            {previewContent || (
              <Text color="gray.500" fontStyle="italic">
                Your prompt preview will appear here...
              </Text>
            )}
          </Box>

          {/* Unfilled Variables Warning */}
          {allVariables.some((v) => !variableValues[v]) && (
            <Alert status="info" mt="12px" borderRadius="md" fontSize="sm">
              <AlertIcon />
              <Box>
                <Text fontWeight="500">Unfilled variables:</Text>
                <Wrap mt="4px">
                  {allVariables
                    .filter((v) => !variableValues[v])
                    .map((v) => (
                      <WrapItem key={v}>
                        <Tag size="sm" colorScheme="orange">
                          <TagLabel>{`{{${v}}}`}</TagLabel>
                        </Tag>
                      </WrapItem>
                    ))}
                </Wrap>
              </Box>
            </Alert>
          )}

          {/* Best Practices Tips */}
          <Box mt="16px">
            <Text fontSize="sm" fontWeight="500" mb="8px">
              Best Practices
            </Text>
            <VStack align="stretch" spacing="4px" fontSize="xs" color="gray.500">
              <HStack>
                <Icon as={MdCheck} color="green.500" />
                <Text>Be specific about the agent's role and responsibilities</Text>
              </HStack>
              <HStack>
                <Icon as={MdCheck} color="green.500" />
                <Text>Include clear guidelines on what to do and what to avoid</Text>
              </HStack>
              <HStack>
                <Icon as={MdCheck} color="green.500" />
                <Text>Use variables for customizable values</Text>
              </HStack>
              <HStack>
                <Icon as={MdCheck} color="green.500" />
                <Text>Define escalation paths and edge case handling</Text>
              </HStack>
            </VStack>
          </Box>
        </Box>
      </SimpleGrid>
    </Box>
  );
}
