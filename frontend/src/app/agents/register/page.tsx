'use client';

import {
  Box,
  Button,
  Flex,
  Icon,
  Text,
  useColorModeValue,
  VStack,
  FormControl,
  FormLabel,
  Input,
  Select,
  Textarea,
  useToast,
  Alert,
  AlertIcon,
  Code,
  IconButton,
  HStack,
} from '@chakra-ui/react';
import { useMutation } from '@apollo/client';
import { useState } from 'react';
import { MdArrowBack, MdCopyAll } from 'react-icons/md';
import { useRouter } from 'next/navigation';
import Card from 'components/card/Card';
import { CREATE_AGENT } from 'graphql/agents';
import { useOrganization } from 'contexts/OrganizationContext';

interface AgentFormData {
  name: string;
  agentType: string;
  description: string;
  deploymentId: string;
  capabilities: string[];
}

const AGENT_TYPES = [
  { value: 'claude_code', label: 'Claude Code' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'codex', label: 'Codex' },
  { value: 'junohub', label: 'JunoHub' },
  { value: 'langchain', label: 'LangChain' },
  { value: 'langgraph', label: 'LangGraph' },
  { value: 'mcp', label: 'MCP Server' },
  { value: 'chat', label: 'Chat Agent' },
  { value: 'custom', label: 'Custom' },
];

export default function RegisterAgentPage() {
  const router = useRouter();
  const toast = useToast();
  const { organizationId } = useOrganization();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [formData, setFormData] = useState<AgentFormData>({
    name: '',
    agentType: 'claude_code',
    description: '',
    deploymentId: '',
    capabilities: [],
  });

  const cardBg = useColorModeValue('white', 'navy.800');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const codeBg = useColorModeValue('gray.100', 'whiteAlpha.100');
  const inputBg = useColorModeValue('white', 'navy.900');
  const inputBorder = useColorModeValue('gray.200', 'whiteAlpha.200');
  const inputColor = useColorModeValue('gray.800', 'white');

  const [createAgent, { loading }] = useMutation(CREATE_AGENT, {
    onCompleted: (result) => {
      if (result.createAgentEndpoint?.success && result.createAgentEndpoint?.endpoint) {
        setApiKey(result.createAgentEndpoint.apiKey);
        setAgentId(result.createAgentEndpoint.endpoint.agentId);
        toast({ title: 'Agent registered successfully', status: 'success' });
      } else {
        toast({ title: 'Failed to register agent', description: result.createAgentEndpoint?.error, status: 'error' });
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) {
      toast({ title: 'No organization found', status: 'error' });
      return;
    }
    createAgent({
      variables: {
        organizationId,
        input: {
          name: formData.name,
          agentType: formData.agentType,
          deploymentId: formData.deploymentId || undefined,
          capabilities: formData.capabilities,
        },
      },
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied to clipboard', status: 'info', duration: 2000 });
  };

  if (apiKey) {
    return (
      <Box pt={{ base: '130px', md: '80px', xl: '80px' }}>
        <Card p="24px" bg={cardBg} maxW="600px" mx="auto">
          <VStack spacing="20px" align="stretch">
            <Text fontSize="xl" fontWeight="600" color={textColor} textAlign="center">
              Agent Registered Successfully
            </Text>
            
            <Alert status="warning">
              <AlertIcon />
              Save these credentials now. The API key will only be shown once.
            </Alert>

            <Box>
              <Text fontWeight="600" mb="8px">Agent ID</Text>
              <Flex bg={codeBg} p="12px" borderRadius="md" align="center" justify="space-between">
                <Code bg="transparent" fontSize="sm">{agentId}</Code>
                <IconButton
                  aria-label="Copy"
                  icon={<MdCopyAll />}
                  size="sm"
                  onClick={() => agentId && copyToClipboard(agentId)}
                />
              </Flex>
            </Box>

            <Box>
              <Text fontWeight="600" mb="8px">API Key</Text>
              <Flex bg={codeBg} p="12px" borderRadius="md" align="center" justify="space-between">
                <Code bg="transparent" fontSize="sm" wordBreak="break-all">{apiKey}</Code>
                <IconButton
                  aria-label="Copy"
                  icon={<MdCopyAll />}
                  size="sm"
                  ml="8px"
                  onClick={() => copyToClipboard(apiKey)}
                />
              </Flex>
            </Box>

            <Box>
              <Text fontWeight="600" mb="8px">Environment Variables</Text>
              <Box bg={codeBg} p="12px" borderRadius="md" fontFamily="mono" fontSize="sm">
                <Text>ZENTINELLE_AGENT_ID={agentId}</Text>
                <Text>ZENTINELLE_API_KEY={apiKey}</Text>
              </Box>
            </Box>

            <Button variant="brand" onClick={() => router.push('/agents')}>
              Go to Agents
            </Button>
          </VStack>
        </Card>
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
            Register Agent
          </Text>
          <Text fontSize="sm" color="gray.500">
            Register a new AI agent to monitor and control
          </Text>
        </Box>
      </Flex>

      <Card p="24px" bg={cardBg} maxW="600px">
        <form onSubmit={handleSubmit}>
          <VStack spacing="20px" align="stretch">
            <FormControl isRequired>
              <FormLabel>Agent Name</FormLabel>
              <Input
                placeholder="my-agent-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                bg={inputBg}
                borderColor={inputBorder}
                color={inputColor}
              />
            </FormControl>

            <FormControl isRequired>
              <FormLabel>Agent Type</FormLabel>
              <Select
                value={formData.agentType}
                onChange={(e) => setFormData({ ...formData, agentType: e.target.value })}
                bg={inputBg}
                borderColor={inputBorder}
                color={inputColor}
              >
                {AGENT_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </Select>
            </FormControl>

            <FormControl>
              <FormLabel>Description</FormLabel>
              <Textarea
                placeholder="Describe what this agent does..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                bg={inputBg}
                borderColor={inputBorder}
                color={inputColor}
              />
            </FormControl>

            <FormControl>
              <FormLabel>Deployment ID (Optional)</FormLabel>
              <Input
                placeholder="deployment-uuid"
                value={formData.deploymentId}
                onChange={(e) => setFormData({ ...formData, deploymentId: e.target.value })}
                bg={inputBg}
                borderColor={inputBorder}
                color={inputColor}
              />
              <Text fontSize="xs" color="gray.500" mt="4px">
                Associate this agent with an existing deployment
              </Text>
            </FormControl>

            <HStack spacing="12px" pt="8px">
              <Button variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="brand"
                isLoading={loading}
                isDisabled={!formData.name}
              >
                Register Agent
              </Button>
            </HStack>
          </VStack>
        </form>
      </Card>
    </Box>
  );
}
