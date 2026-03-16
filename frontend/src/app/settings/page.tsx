'use client';

import {
  Box,
  Button,
  Flex,
  Icon,
  SimpleGrid,
  Text,
  useColorModeValue,
  Switch,
  FormControl,
  FormLabel,
  FormHelperText,
  Input,
  Select,
  Divider,
  useToast,
  VStack,
  Spinner,
  Alert,
  AlertIcon,
  Badge,
  InputGroup,
  InputRightElement,
  IconButton,
  Collapse,
  HStack,
} from '@chakra-ui/react';
import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import {
  MdSave,
  MdNotifications,
  MdIntegrationInstructions,
  MdBusiness,
  MdLink,
  MdLinkOff,
  MdCheckCircle,
  MdError,
  MdVisibility,
  MdVisibilityOff,
} from 'react-icons/md';
import Card from 'components/card/Card';
import { GET_ORGANIZATION_SETTINGS, UPDATE_ORGANIZATION_SETTINGS } from 'graphql/organization';
import { usePageHeader } from 'contexts/PageHeaderContext';
import {
  GET_CLIENT_COVE_INTEGRATION,
  TEST_CLIENT_COVE_CONNECTION,
  SAVE_CLIENT_COVE_CONFIG,
  DISCONNECT_CLIENT_COVE,
  TEST_WEBHOOK,
} from 'graphql/integration';

interface OrganizationSettings {
  contactEmail?: string;
  timezone?: string;
  emailNotifications?: boolean;
  slackNotifications?: boolean;
  webhookUrl?: string;
  defaultPolicyMode?: string;
  auditLogging?: boolean;
}

export default function SettingsPage() {
  usePageHeader('Settings', 'Configure your organization and Zentinelle preferences');
  const toast = useToast();
  const cardBg = useColorModeValue('white', 'navy.800');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.100');

  // Organization settings
  const { data, loading, error, refetch } = useQuery(GET_ORGANIZATION_SETTINGS);
  const [updateSettings, { loading: saving }] = useMutation(UPDATE_ORGANIZATION_SETTINGS);

  const [orgName, setOrgName] = useState('');
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [slackAlerts, setSlackAlerts] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [defaultPolicyMode, setDefaultPolicyMode] = useState('warn');
  const [auditLogging, setAuditLogging] = useState(true);

  // Client Cove integration
  const { data: integrationData, refetch: refetchIntegration } = useQuery(GET_CLIENT_COVE_INTEGRATION);
  const [testConnection, { loading: testing }] = useMutation(TEST_CLIENT_COVE_CONNECTION);
  const [saveConfig, { loading: connecting }] = useMutation(SAVE_CLIENT_COVE_CONFIG);
  const [disconnectCove, { loading: disconnecting }] = useMutation(DISCONNECT_CLIENT_COVE);
  const [testWebhook, { loading: testingWebhook }] = useMutation(TEST_WEBHOOK);
  const [webhookTestResult, setWebhookTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [coveUrl, setCoveUrl] = useState('');
  const [coveApiKey, setCoveApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showConnectForm, setShowConnectForm] = useState(false);

  const integration = integrationData?.clientCoveIntegration;
  const isConnected = integration?.isActive && integration?.status === 'connected';

  useEffect(() => {
    if (data?.myOrganization) {
      const org = data.myOrganization;
      const settings: OrganizationSettings = org.settings || {};
      setOrgName(org.name || '');
      setEmailAlerts(settings.emailNotifications ?? true);
      setSlackAlerts(settings.slackNotifications ?? false);
      setWebhookUrl(settings.webhookUrl || '');
      setDefaultPolicyMode(settings.defaultPolicyMode || 'warn');
      setAuditLogging(settings.auditLogging ?? true);
    }
  }, [data]);

  const handleSave = async () => {
    try {
      await updateSettings({
        variables: {
          settings: {
            name: orgName,
            emailNotifications: emailAlerts,
            slackNotifications: slackAlerts,
            webhookUrl,
            defaultPolicyMode,
            auditLogging,
          },
        },
      });
      toast({ title: 'Settings saved successfully', status: 'success' });
      refetch();
    } catch (err) {
      toast({
        title: 'Failed to save settings',
        description: err instanceof Error ? err.message : 'Unknown error',
        status: 'error',
      });
    }
  };

  const handleTestConnection = async () => {
    setTestResult(null);
    try {
      const { data } = await testConnection({ variables: { url: coveUrl, apiKey: coveApiKey } });
      const result = data?.testClientCoveConnection;
      setTestResult({ success: result?.success, message: result?.message });
    } catch (err) {
      setTestResult({ success: false, message: err instanceof Error ? err.message : 'Unknown error' });
    }
  };

  const handleConnect = async () => {
    setTestResult(null);
    try {
      const { data } = await saveConfig({ variables: { url: coveUrl, apiKey: coveApiKey } });
      const result = data?.saveClientCoveConfig;
      if (result?.success) {
        toast({ title: 'Connected to Client Cove', status: 'success' });
        setCoveUrl('');
        setCoveApiKey('');
        setShowConnectForm(false);
        refetchIntegration();
      } else {
        setTestResult({ success: false, message: result?.message || 'Connection failed' });
      }
    } catch (err) {
      toast({
        title: 'Connection failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        status: 'error',
      });
    }
  };

  const handleTestWebhook = async () => {
    setWebhookTestResult(null);
    try {
      const { data } = await testWebhook({ variables: { url: webhookUrl } });
      const r = data?.testWebhook;
      setWebhookTestResult({ success: r?.success, message: r?.message });
    } catch (err) {
      setWebhookTestResult({ success: false, message: err instanceof Error ? err.message : 'Unknown error' });
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectCove();
      toast({ title: 'Disconnected from Client Cove', status: 'info' });
      refetchIntegration();
    } catch (err) {
      toast({ title: 'Failed to disconnect', status: 'error' });
    }
  };

  if (loading) {
    return (
      <Box pt={{ base: '130px', md: '80px', xl: '80px' }}>
        <Flex justify="center" align="center" minH="400px">
          <Spinner size="xl" color="brand.500" />
        </Flex>
      </Box>
    );
  }

  if (error) {
    return (
      <Box pt={{ base: '130px', md: '80px', xl: '80px' }}>
        <Alert status="error">
          <AlertIcon />
          Failed to load settings: {error.message}
        </Alert>
      </Box>
    );
  }

  return (
    <Box pt={{ base: '130px', md: '80px', xl: '80px' }}>
      <Flex justify="flex-end" mb="20px">
        <Button
          variant="brand"
          leftIcon={<Icon as={MdSave} />}
          onClick={handleSave}
          isLoading={saving}
        >
          Save Changes
        </Button>
      </Flex>

      <SimpleGrid columns={{ base: 1, xl: 2 }} spacing="20px">
        {/* Organization Settings */}
        <Card p="24px" bg={cardBg}>
          <Flex align="center" gap="12px" mb="20px">
            <Flex
              w="40px"
              h="40px"
              bg="brand.500"
              borderRadius="12px"
              align="center"
              justify="center"
            >
              <Icon as={MdBusiness} color="white" boxSize="20px" />
            </Flex>
            <Box>
              <Text fontSize="lg" fontWeight="600" color={textColor}>
                Organization
              </Text>
              <Text fontSize="sm" color="gray.500">
                Basic organization settings
              </Text>
            </Box>
          </Flex>

          <VStack spacing="16px" align="stretch">
            <FormControl>
              <FormLabel>Organization Name</FormLabel>
              <Input
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
              />
            </FormControl>
          </VStack>
        </Card>

        {/* Notification Settings */}
        <Card p="24px" bg={cardBg}>
          <Flex align="center" gap="12px" mb="20px">
            <Flex
              w="40px"
              h="40px"
              bg="orange.500"
              borderRadius="12px"
              align="center"
              justify="center"
            >
              <Icon as={MdNotifications} color="white" boxSize="20px" />
            </Flex>
            <Box>
              <Text fontSize="lg" fontWeight="600" color={textColor}>
                Notifications
              </Text>
              <Text fontSize="sm" color="gray.500">
                Alert and notification preferences
              </Text>
            </Box>
          </Flex>

          <VStack spacing="16px" align="stretch">
            <FormControl display="flex" alignItems="center" justifyContent="space-between">
              <Box>
                <FormLabel mb="0">Email Alerts</FormLabel>
                <FormHelperText mt="4px">Receive critical alerts via email</FormHelperText>
              </Box>
              <Switch
                isChecked={emailAlerts}
                onChange={(e) => setEmailAlerts(e.target.checked)}
                colorScheme="brand"
              />
            </FormControl>

            <Divider borderColor={borderColor} />

            <FormControl display="flex" alignItems="center" justifyContent="space-between">
              <Box>
                <FormLabel mb="0">Slack Integration</FormLabel>
                <FormHelperText mt="4px">Send alerts to Slack channel</FormHelperText>
              </Box>
              <Switch
                isChecked={slackAlerts}
                onChange={(e) => setSlackAlerts(e.target.checked)}
                colorScheme="brand"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Webhook URL</FormLabel>
              <HStack gap="8px">
                <Input
                  value={webhookUrl}
                  onChange={(e) => { setWebhookUrl(e.target.value); setWebhookTestResult(null); }}
                  placeholder="https://hooks.slack.com/..."
                />
                <Button
                  size="md"
                  variant="outline"
                  flexShrink={0}
                  onClick={handleTestWebhook}
                  isLoading={testingWebhook}
                  isDisabled={!webhookUrl}
                >
                  Test
                </Button>
              </HStack>
              <FormHelperText>Receive alerts via webhook (Slack incoming webhooks supported)</FormHelperText>
              {webhookTestResult && (
                <Alert status={webhookTestResult.success ? 'success' : 'error'} mt="8px" borderRadius="8px" py="8px">
                  <AlertIcon boxSize="16px" />
                  <Text fontSize="sm">{webhookTestResult.message}</Text>
                </Alert>
              )}
            </FormControl>
          </VStack>
        </Card>

        {/* Agent Settings */}
        <Card p="24px" bg={cardBg}>
          <Flex align="center" gap="12px" mb="20px">
            <Flex
              w="40px"
              h="40px"
              bg="green.500"
              borderRadius="12px"
              align="center"
              justify="center"
            >
              <Icon as={MdIntegrationInstructions} color="white" boxSize="20px" />
            </Flex>
            <Box>
              <Text fontSize="lg" fontWeight="600" color={textColor}>
                Agent Defaults
              </Text>
              <Text fontSize="sm" color="gray.500">
                Default settings for AI agents
              </Text>
            </Box>
          </Flex>

          <VStack spacing="16px" align="stretch">
            <FormControl>
              <FormLabel>Default Policy Mode</FormLabel>
              <Select
                value={defaultPolicyMode}
                onChange={(e) => setDefaultPolicyMode(e.target.value)}
              >
                <option value="block">Block - Reject policy violations</option>
                <option value="warn">Warn - Log and continue</option>
                <option value="audit">Audit - Log only</option>
              </Select>
              <FormHelperText>Applied to new agents without explicit policy</FormHelperText>
            </FormControl>

            <Divider borderColor={borderColor} />

            <FormControl display="flex" alignItems="center" justifyContent="space-between">
              <Box>
                <FormLabel mb="0">Audit Logging</FormLabel>
                <FormHelperText mt="4px">Log all agent actions for compliance</FormHelperText>
              </Box>
              <Switch
                isChecked={auditLogging}
                onChange={(e) => setAuditLogging(e.target.checked)}
                colorScheme="brand"
              />
            </FormControl>
          </VStack>
        </Card>

        {/* Client Cove Integration */}
        <Card p="24px" bg={cardBg}>
          <Flex align="center" gap="12px" mb="20px">
            <Flex
              w="40px"
              h="40px"
              bg={isConnected ? 'teal.500' : 'gray.400'}
              borderRadius="12px"
              align="center"
              justify="center"
            >
              <Icon as={isConnected ? MdLink : MdLinkOff} color="white" boxSize="20px" />
            </Flex>
            <Box flex="1">
              <Flex align="center" gap="8px">
                <Text fontSize="lg" fontWeight="600" color={textColor}>
                  Calliope AI Client Cove
                </Text>
                <Badge
                  colorScheme={isConnected ? 'teal' : 'gray'}
                  fontSize="xs"
                  borderRadius="full"
                  px="8px"
                >
                  {isConnected ? 'Connected' : 'Not Connected'}
                </Badge>
              </Flex>
              <Text fontSize="sm" color="gray.500">
                Sync auth and tenant management with Calliope AI
              </Text>
            </Box>
          </Flex>

          {isConnected ? (
            <VStack spacing="12px" align="stretch">
              <Box
                p="12px"
                bg={useColorModeValue('teal.50', 'teal.900')}
                borderRadius="8px"
                borderLeft="3px solid"
                borderLeftColor="teal.400"
              >
                <HStack gap="8px" mb="4px">
                  <Icon as={MdCheckCircle} color="teal.500" boxSize="16px" />
                  <Text fontSize="sm" fontWeight="600" color={useColorModeValue('teal.700', 'teal.200')}>
                    Connected
                  </Text>
                </HStack>
                <Text fontSize="xs" color="gray.500" fontFamily="mono">
                  {integration.clientCoveUrl}
                </Text>
                {integration.lastTestedAt && (
                  <Text fontSize="xs" color="gray.400" mt="4px">
                    Last verified {new Date(integration.lastTestedAt).toLocaleString()}
                  </Text>
                )}
              </Box>

              <Collapse in={showConnectForm} animateOpacity>
                <VStack spacing="12px" align="stretch" pt="4px">
                  <Divider borderColor={borderColor} />
                  <Text fontSize="sm" fontWeight="500" color={textColor}>Update credentials</Text>
                  <FormControl>
                    <FormLabel fontSize="sm">Client Cove URL</FormLabel>
                    <Input
                      value={coveUrl}
                      onChange={(e) => setCoveUrl(e.target.value)}
                      placeholder="https://app.calliope.ai"
                      size="sm"
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel fontSize="sm">Internal API Key</FormLabel>
                    <InputGroup size="sm">
                      <Input
                        value={coveApiKey}
                        onChange={(e) => setCoveApiKey(e.target.value)}
                        type={showApiKey ? 'text' : 'password'}
                        placeholder="New API key"
                      />
                      <InputRightElement>
                        <IconButton
                          aria-label="Toggle API key visibility"
                          icon={<Icon as={showApiKey ? MdVisibilityOff : MdVisibility} />}
                          size="xs"
                          variant="ghost"
                          onClick={() => setShowApiKey(!showApiKey)}
                        />
                      </InputRightElement>
                    </InputGroup>
                  </FormControl>
                  {testResult && (
                    <Alert status={testResult.success ? 'success' : 'error'} borderRadius="8px" py="8px">
                      <AlertIcon boxSize="16px" />
                      <Text fontSize="sm">{testResult.message}</Text>
                    </Alert>
                  )}
                  <HStack gap="8px">
                    <Button size="sm" variant="outline" onClick={handleTestConnection} isLoading={testing} isDisabled={!coveUrl || !coveApiKey}>
                      Test
                    </Button>
                    <Button size="sm" variant="brand" onClick={handleConnect} isLoading={connecting} isDisabled={!coveUrl || !coveApiKey}>
                      Update & Reconnect
                    </Button>
                  </HStack>
                </VStack>
              </Collapse>

              <Flex gap="8px" justify="flex-end">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setShowConnectForm(!showConnectForm); setTestResult(null); }}
                >
                  {showConnectForm ? 'Cancel' : 'Update credentials'}
                </Button>
                <Button
                  size="sm"
                  colorScheme="red"
                  variant="outline"
                  leftIcon={<Icon as={MdLinkOff} />}
                  onClick={handleDisconnect}
                  isLoading={disconnecting}
                >
                  Disconnect
                </Button>
              </Flex>
            </VStack>
          ) : (
            <VStack spacing="16px" align="stretch">
              <Text fontSize="sm" color="gray.500">
                Connect Zentinelle to your Calliope AI Client Cove instance to delegate authentication
                and sync tenant management. Requires a service-to-service API key from your Calliope AI admin.
              </Text>

              <FormControl>
                <FormLabel fontSize="sm">Client Cove URL</FormLabel>
                <Input
                  value={coveUrl}
                  onChange={(e) => setCoveUrl(e.target.value)}
                  placeholder="https://app.calliope.ai"
                />
              </FormControl>

              <FormControl>
                <FormLabel fontSize="sm">Internal API Key</FormLabel>
                <InputGroup>
                  <Input
                    value={coveApiKey}
                    onChange={(e) => setCoveApiKey(e.target.value)}
                    type={showApiKey ? 'text' : 'password'}
                    placeholder="sk_internal_..."
                  />
                  <InputRightElement>
                    <IconButton
                      aria-label="Toggle API key visibility"
                      icon={<Icon as={showApiKey ? MdVisibilityOff : MdVisibility} />}
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowApiKey(!showApiKey)}
                    />
                  </InputRightElement>
                </InputGroup>
                <FormHelperText>
                  Find this in your Calliope AI admin panel under Integrations → Zentinelle
                </FormHelperText>
              </FormControl>

              {testResult && (
                <Alert status={testResult.success ? 'success' : 'error'} borderRadius="8px">
                  <AlertIcon />
                  <Text fontSize="sm">{testResult.message}</Text>
                </Alert>
              )}

              <HStack gap="8px" justify="flex-end">
                <Button
                  variant="outline"
                  leftIcon={<Icon as={MdLink} />}
                  onClick={handleTestConnection}
                  isLoading={testing}
                  isDisabled={!coveUrl || !coveApiKey}
                >
                  Test Connection
                </Button>
                <Button
                  variant="brand"
                  leftIcon={<Icon as={MdLink} />}
                  onClick={handleConnect}
                  isLoading={connecting}
                  isDisabled={!coveUrl || !coveApiKey}
                >
                  Connect
                </Button>
              </HStack>
            </VStack>
          )}
        </Card>
      </SimpleGrid>
    </Box>
  );
}
