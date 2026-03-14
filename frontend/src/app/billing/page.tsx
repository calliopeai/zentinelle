'use client';

import {
  Box,
  Button,
  Flex,
  Heading,
  Icon,
  SimpleGrid,
  Spinner,
  Text,
  useColorModeValue,
  Badge,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  useToast,
  Divider,
  Progress,
  IconButton,
} from '@chakra-ui/react';
import { useQuery, useMutation, gql } from '@apollo/client';
import { MdRefresh, MdCreditCard, MdHistory, MdOpenInNew, MdReceipt } from 'react-icons/md';
import Card from 'components/card/Card';
import { GET_BILLING_OVERVIEW, GET_AVAILABLE_PLANS } from 'graphql/billing';

// Mutation for creating portal session
const CREATE_PORTAL_SESSION = gql`
  mutation CreatePortalSession {
    createPortalSession {
      portalUrl
      errors
    }
  }
`;

interface PlanType {
  id: string;
  name: string;
  price: number;
  interval: string;
  features: string[];
}

interface SubscriptionType {
  id: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

interface UsageType {
  totalSpend: number;
  apiCalls: number;
  agents: number;
  storage: number;
  periodStart: string;
  periodEnd: string;
}

interface PaymentMethodType {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

interface InvoiceType {
  id: string;
  amount: number;
  status: string;
  date: string;
  invoiceUrl: string;
}

interface BillingOverview {
  currentPlan: PlanType | null;
  subscription: SubscriptionType | null;
  currentUsage: UsageType | null;
  paymentMethod: PaymentMethodType | null;
  invoices: InvoiceType[];
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount / 100);
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
  return num.toString();
}

function getStatusColor(status: string): string {
  switch (status?.toLowerCase()) {
    case 'active':
    case 'paid':
      return 'green';
    case 'trialing':
      return 'blue';
    case 'past_due':
    case 'open':
      return 'orange';
    case 'canceled':
    case 'unpaid':
      return 'red';
    default:
      return 'gray';
  }
}

export default function BillingPage() {
  const toast = useToast();

  const cardBg = useColorModeValue('white', 'navy.800');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.100');
  const cardInnerBg = useColorModeValue('gray.50', 'navy.700');

  const { data, loading, error, refetch } = useQuery(GET_BILLING_OVERVIEW, {
    fetchPolicy: 'cache-and-network',
  });

  const [createPortalSession, { loading: portalLoading }] = useMutation(CREATE_PORTAL_SESSION, {
    onCompleted: (result) => {
      if (result.createPortalSession?.portalUrl) {
        window.location.href = result.createPortalSession.portalUrl;
      } else {
        toast({
          title: 'Unable to open billing portal',
          description: result.createPortalSession?.errors?.join(', '),
          status: 'error',
        });
      }
    },
    onError: (err) => {
      toast({ title: 'Failed to open billing portal', description: err.message, status: 'error' });
    },
  });

  const billing: BillingOverview | null = data?.billingOverview || null;
  const plan = billing?.currentPlan;
  const subscription = billing?.subscription;
  const usage = billing?.currentUsage;
  const paymentMethod = billing?.paymentMethod;
  const invoices = billing?.invoices || [];

  const handleManageBilling = () => {
    createPortalSession();
  };

  // Loading state
  if (loading && !billing) {
    return (
      <Box pt={{ base: '130px', md: '80px', xl: '80px' }}>
        <Flex justify="center" py="40px">
          <Spinner size="xl" color="brand.500" />
        </Flex>
      </Box>
    );
  }

  // Error state
  if (error) {
    return (
      <Box pt={{ base: '130px', md: '80px', xl: '80px' }}>
        <Card p="20px" bg={cardBg}>
          <Text color="red.500">Error loading billing information: {error.message}</Text>
          <Button mt="12px" onClick={() => refetch()}>
            Try Again
          </Button>
        </Card>
      </Box>
    );
  }

  // No subscription state
  if (!subscription) {
    return (
      <Box pt={{ base: '130px', md: '80px', xl: '80px' }}>
        <Flex justify="space-between" align="center" mb="20px">
          <Box>
            <Heading size="lg" color={textColor}>
              Billing & Subscription
            </Heading>
            <Text fontSize="sm" color="secondaryGray.600">
              Manage your plan and payment methods
            </Text>
          </Box>
        </Flex>

        <Card p="40px" bg={cardBg} textAlign="center">
          <Icon as={MdCreditCard} boxSize="48px" color="gray.400" mb="16px" mx="auto" />
          <Text fontSize="lg" color={textColor} mb="8px">
            No Active Subscription
          </Text>
          <Text color="gray.500" mb="20px">
            Get started by choosing a plan that fits your needs
          </Text>
          <Button variant="brand" onClick={handleManageBilling} isLoading={portalLoading}>
            Choose a Plan
          </Button>
        </Card>
      </Box>
    );
  }

  return (
    <Box pt={{ base: '130px', md: '80px', xl: '80px' }}>
      {/* Header */}
      <Flex justify="space-between" align="center" mb="20px">
        <Box>
          <Heading size="lg" color={textColor}>
            Billing & Subscription
          </Heading>
          <Text fontSize="sm" color="secondaryGray.600">
            Manage your plan, usage, and payment methods
          </Text>
        </Box>
        <Flex gap="12px">
          <IconButton
            aria-label="Refresh"
            icon={<MdRefresh />}
            variant="outline"
            onClick={() => refetch()}
            isLoading={loading}
          />
          <Button
            variant="brand"
            leftIcon={<Icon as={MdCreditCard} />}
            onClick={handleManageBilling}
            isLoading={portalLoading}
          >
            Manage Billing
          </Button>
        </Flex>
      </Flex>

      {/* Current Plan & Payment Method */}
      <SimpleGrid columns={{ base: 1, xl: 2 }} spacing="20px" mb="24px">
        {/* Current Plan Card */}
        <Card p="24px" bg={cardBg}>
          <Flex justify="space-between" align="start" mb="20px">
            <Box>
              <Badge colorScheme={getStatusColor(subscription.status)} mb="8px">
                {subscription.status?.toUpperCase()}
              </Badge>
              {subscription.cancelAtPeriodEnd && (
                <Badge colorScheme="orange" ml="8px" mb="8px">
                  CANCELING
                </Badge>
              )}
              <Text fontSize="2xl" fontWeight="700" color={textColor}>
                {plan?.name || 'Unknown'} Plan
              </Text>
              <Text fontSize="sm" color="gray.500">
                Billing period:{' '}
                {subscription.currentPeriodStart
                  ? new Date(subscription.currentPeriodStart).toLocaleDateString()
                  : 'N/A'}{' '}
                -{' '}
                {subscription.currentPeriodEnd
                  ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
                  : 'N/A'}
              </Text>
            </Box>
            <Box textAlign="right">
              <Text fontSize="3xl" fontWeight="700" color={textColor}>
                {plan?.price ? formatCurrency(plan.price) : '$0'}
              </Text>
              <Text fontSize="sm" color="gray.500">
                /{plan?.interval || 'month'}
              </Text>
            </Box>
          </Flex>

          <Divider mb="20px" borderColor={borderColor} />

          {/* Plan Features */}
          {Array.isArray(plan?.features) && plan.features.length > 0 && (
            <SimpleGrid columns={2} spacing="12px">
              {plan.features.slice(0, 6).map((feature, idx) => (
                <Text key={idx} fontSize="sm" color={textColor}>
                  • {feature}
                </Text>
              ))}
            </SimpleGrid>
          )}
        </Card>

        {/* Payment Method & Summary Card */}
        <Card p="24px" bg={cardBg}>
          <Flex align="center" gap="12px" mb="20px">
            <Icon as={MdCreditCard} boxSize="24px" color="brand.500" />
            <Text fontSize="lg" fontWeight="600" color={textColor}>
              Payment Method
            </Text>
          </Flex>

          {paymentMethod ? (
            <Flex
              p="16px"
              bg={cardInnerBg}
              borderRadius="12px"
              align="center"
              justify="space-between"
              mb="20px"
            >
              <Flex align="center" gap="12px">
                <Box
                  w="48px"
                  h="32px"
                  bg="white"
                  borderRadius="4px"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  fontSize="xs"
                  fontWeight="bold"
                  color="blue.600"
                  textTransform="uppercase"
                >
                  {paymentMethod.brand}
                </Box>
                <Box>
                  <Text fontWeight="600" color={textColor}>
                    •••• •••• •••• {paymentMethod.last4}
                  </Text>
                  <Text fontSize="sm" color="gray.500">
                    Expires {paymentMethod.expMonth}/{paymentMethod.expYear}
                  </Text>
                </Box>
              </Flex>
            </Flex>
          ) : (
            <Flex p="16px" bg={cardInnerBg} borderRadius="12px" mb="20px">
              <Text color="gray.500">No payment method on file</Text>
            </Flex>
          )}

          <Text fontSize="sm" color="gray.500" mb="8px">
            Next billing date
          </Text>
          <Text fontWeight="600" color={textColor} mb="16px">
            {subscription.currentPeriodEnd
              ? new Date(subscription.currentPeriodEnd).toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })
              : 'N/A'}
          </Text>

          {usage && (
            <>
              <Divider mb="16px" borderColor={borderColor} />
              <Flex justify="space-between" mb="8px">
                <Text color="gray.500">Current period spend</Text>
                <Text fontWeight="600" color={textColor}>
                  {formatCurrency(usage.totalSpend || 0)}
                </Text>
              </Flex>
            </>
          )}
        </Card>
      </SimpleGrid>

      {/* Usage Summary */}
      {usage && (
        <Card p="24px" bg={cardBg} mb="24px">
          <Text fontSize="lg" fontWeight="600" color={textColor} mb="20px">
            Current Period Usage
          </Text>
          <SimpleGrid columns={{ base: 2, md: 4 }} spacing="20px">
            <Box>
              <Text fontSize="sm" color="gray.500" mb="4px">
                API Calls
              </Text>
              <Text fontSize="2xl" fontWeight="700" color={textColor}>
                {formatNumber(usage.apiCalls || 0)}
              </Text>
            </Box>
            <Box>
              <Text fontSize="sm" color="gray.500" mb="4px">
                Active Agents
              </Text>
              <Text fontSize="2xl" fontWeight="700" color={textColor}>
                {usage.agents || 0}
              </Text>
            </Box>
            <Box>
              <Text fontSize="sm" color="gray.500" mb="4px">
                Storage Used
              </Text>
              <Text fontSize="2xl" fontWeight="700" color={textColor}>
                {formatNumber(usage.storage || 0)} MB
              </Text>
            </Box>
            <Box>
              <Text fontSize="sm" color="gray.500" mb="4px">
                Total Spend
              </Text>
              <Text fontSize="2xl" fontWeight="700" color="brand.500">
                {formatCurrency(usage.totalSpend || 0)}
              </Text>
            </Box>
          </SimpleGrid>
        </Card>
      )}

      {/* Invoice History */}
      <Card p="0" bg={cardBg}>
        <Box p="20px" borderBottom="1px solid" borderColor={borderColor}>
          <Flex align="center" gap="12px">
            <Icon as={MdHistory} boxSize="24px" color="brand.500" />
            <Box>
              <Text fontSize="lg" fontWeight="600" color={textColor}>
                Invoice History
              </Text>
              <Text fontSize="sm" color="gray.500">
                View and download past invoices
              </Text>
            </Box>
          </Flex>
        </Box>

        {invoices.length > 0 ? (
          <Box overflowX="auto">
            <Table variant="simple">
              <Thead>
                <Tr>
                  <Th borderColor={borderColor} color="secondaryGray.600">
                    Date
                  </Th>
                  <Th borderColor={borderColor} color="secondaryGray.600">
                    Status
                  </Th>
                  <Th borderColor={borderColor} color="secondaryGray.600" isNumeric>
                    Amount
                  </Th>
                  <Th borderColor={borderColor} color="secondaryGray.600">
                    Actions
                  </Th>
                </Tr>
              </Thead>
              <Tbody>
                {invoices.map((invoice) => (
                  <Tr key={invoice.id}>
                    <Td borderColor={borderColor}>
                      {invoice.date ? new Date(invoice.date).toLocaleDateString() : 'N/A'}
                    </Td>
                    <Td borderColor={borderColor}>
                      <Badge colorScheme={getStatusColor(invoice.status)}>{invoice.status}</Badge>
                    </Td>
                    <Td borderColor={borderColor} isNumeric fontWeight="600">
                      {formatCurrency(invoice.amount || 0)}
                    </Td>
                    <Td borderColor={borderColor}>
                      {invoice.invoiceUrl ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          leftIcon={<Icon as={MdOpenInNew} />}
                          as="a"
                          href={invoice.invoiceUrl}
                          target="_blank"
                        >
                          View
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" leftIcon={<Icon as={MdReceipt} />} isDisabled>
                          No Invoice
                        </Button>
                      )}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>
        ) : (
          <Flex justify="center" py="40px">
            <Text color="gray.500">No invoices yet</Text>
          </Flex>
        )}
      </Card>
    </Box>
  );
}
