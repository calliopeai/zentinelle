'use client';

import {
  Box,
  Button,
  Flex,
  Heading,
  Icon,
  SimpleGrid,
  Text,
  useColorModeValue,
  Switch,
  FormControl,
  FormLabel,
  FormHelperText,
  Input,
  Textarea,
  Select,
  Divider,
  useToast,
  VStack,
  Spinner,
  Alert,
  AlertIcon,
} from '@chakra-ui/react';
import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { MdSave, MdSecurity, MdNotifications, MdIntegrationInstructions, MdBusiness } from 'react-icons/md';
import Card from 'components/card/Card';
import { GET_ORGANIZATION_SETTINGS, UPDATE_ORGANIZATION_SETTINGS } from 'graphql/organization';

interface OrganizationSettings {
  contactEmail?: string;
  timezone?: string;
  mfaRequired?: boolean;
  sessionTimeout?: number;
  ipWhitelist?: string;
  emailNotifications?: boolean;
  slackNotifications?: boolean;
  webhookUrl?: string;
  defaultPolicyMode?: string;
  auditLogging?: boolean;
  autoRotateSecrets?: boolean;
}

export default function SettingsPage() {
  const toast = useToast();
  const cardBg = useColorModeValue('white', 'navy.800');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.100');
  const readOnlyBg = useColorModeValue('gray.50', 'whiteAlpha.100');

  // GraphQL query
  const { data, loading, error, refetch } = useQuery(GET_ORGANIZATION_SETTINGS);
  const [updateSettings, { loading: saving }] = useMutation(UPDATE_ORGANIZATION_SETTINGS);

  // Organization settings
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');

  // Security settings
  const [mfaRequired, setMfaRequired] = useState(false);
  const [sessionTimeout, setSessionTimeout] = useState('24');
  const [ipWhitelist, setIpWhitelist] = useState('');

  // Notification settings
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [slackAlerts, setSlackAlerts] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');

  // Agent settings
  const [defaultPolicyMode, setDefaultPolicyMode] = useState('warn');
  const [auditLogging, setAuditLogging] = useState(true);
  const [autoRotateSecrets, setAutoRotateSecrets] = useState(true);

  // Load data from backend
  useEffect(() => {
    if (data?.myOrganization) {
      const org = data.myOrganization;
      const settings: OrganizationSettings = org.settings || {};

      setOrgName(org.name || '');
      setOrgSlug(org.slug || '');

      // Security
      setMfaRequired(settings.mfaRequired ?? false);
      setSessionTimeout(String(settings.sessionTimeout || 24));
      setIpWhitelist(settings.ipWhitelist || '');

      // Notifications
      setEmailAlerts(settings.emailNotifications ?? true);
      setSlackAlerts(settings.slackNotifications ?? false);
      setWebhookUrl(settings.webhookUrl || '');

      // Agent defaults
      setDefaultPolicyMode(settings.defaultPolicyMode || 'warn');
      setAuditLogging(settings.auditLogging ?? true);
      setAutoRotateSecrets(settings.autoRotateSecrets ?? true);
    }
  }, [data]);

  const handleSave = async () => {
    try {
      await updateSettings({
        variables: {
          settings: {
            name: orgName,
            mfaRequired,
            sessionTimeout: parseInt(sessionTimeout),
            ipWhitelist,
            emailNotifications: emailAlerts,
            slackNotifications: slackAlerts,
            webhookUrl,
            defaultPolicyMode,
            auditLogging,
            autoRotateSecrets,
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
      {/* Header */}
      <Flex justify="space-between" align="center" mb="20px">
        <Box>
          <Heading size="lg" color={textColor}>
            Settings
          </Heading>
          <Text fontSize="sm" color="secondaryGray.600">
            Configure your organization and Zentinelle preferences
          </Text>
        </Box>
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
            <FormControl>
              <FormLabel>Organization Slug</FormLabel>
              <Input
                value={orgSlug}
                isReadOnly
                bg={readOnlyBg}
              />
              <FormHelperText>Used in URLs and API calls (read-only)</FormHelperText>
            </FormControl>
          </VStack>
        </Card>

        {/* Security Settings */}
        <Card p="24px" bg={cardBg}>
          <Flex align="center" gap="12px" mb="20px">
            <Flex
              w="40px"
              h="40px"
              bg="red.500"
              borderRadius="12px"
              align="center"
              justify="center"
            >
              <Icon as={MdSecurity} color="white" boxSize="20px" />
            </Flex>
            <Box>
              <Text fontSize="lg" fontWeight="600" color={textColor}>
                Security
              </Text>
              <Text fontSize="sm" color="gray.500">
                Authentication and access control
              </Text>
            </Box>
          </Flex>

          <VStack spacing="16px" align="stretch">
            <FormControl display="flex" alignItems="center" justifyContent="space-between">
              <Box>
                <FormLabel mb="0">Require MFA</FormLabel>
                <FormHelperText mt="4px">Require multi-factor authentication for all users</FormHelperText>
              </Box>
              <Switch
                isChecked={mfaRequired}
                onChange={(e) => setMfaRequired(e.target.checked)}
                colorScheme="brand"
              />
            </FormControl>

            <Divider borderColor={borderColor} />

            <FormControl>
              <FormLabel>Session Timeout (hours)</FormLabel>
              <Select
                value={sessionTimeout}
                onChange={(e) => setSessionTimeout(e.target.value)}
              >
                <option value="1">1 hour</option>
                <option value="8">8 hours</option>
                <option value="24">24 hours</option>
                <option value="72">72 hours</option>
              </Select>
            </FormControl>

            <FormControl>
              <FormLabel>IP Whitelist</FormLabel>
              <Textarea
                value={ipWhitelist}
                onChange={(e) => setIpWhitelist(e.target.value)}
                placeholder="Enter IP addresses, one per line"
                rows={3}
              />
              <FormHelperText>Leave empty to allow all IPs</FormHelperText>
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
              <Input
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://..."
              />
              <FormHelperText>Receive alerts via webhook</FormHelperText>
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

            <Divider borderColor={borderColor} />

            <FormControl display="flex" alignItems="center" justifyContent="space-between">
              <Box>
                <FormLabel mb="0">Auto-Rotate Secrets</FormLabel>
                <FormHelperText mt="4px">Automatically rotate secrets on schedule</FormHelperText>
              </Box>
              <Switch
                isChecked={autoRotateSecrets}
                onChange={(e) => setAutoRotateSecrets(e.target.checked)}
                colorScheme="brand"
              />
            </FormControl>
          </VStack>
        </Card>
      </SimpleGrid>
    </Box>
  );
}
