'use client';
import {
  Box,
  Flex,
  Icon,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Text,
  useColorModeValue,
  Badge,
} from '@chakra-ui/react';
import { useQuery } from '@apollo/client';
import { GET_USER_APP_ACCESS } from 'graphql/appSwitcher';
import { MdApps, MdDashboard, MdHandshake, MdSmartToy, MdAdminPanelSettings, MdOpenInNew } from 'react-icons/md';
import { useAuth } from 'contexts/AuthContext';

interface AppOption {
  name: string;
  description: string;
  icon: React.ElementType;
  href: string;
  color: string;
  badge?: string;
}

export default function AppSwitcher() {
  const { isAuthenticated } = useAuth();
  const { data, loading } = useQuery(GET_USER_APP_ACCESS, {
    skip: !isAuthenticated,
  });

  const menuBg = useColorModeValue('white', 'navy.800');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const borderColor = useColorModeValue('#E6ECFA', 'rgba(135, 140, 189, 0.3)');
  const hoverBg = useColorModeValue('gray.100', 'whiteAlpha.100');
  const shadow = useColorModeValue(
    '14px 17px 40px 4px rgba(112, 144, 176, 0.18)',
    '14px 17px 40px 4px rgba(112, 144, 176, 0.06)',
  );
  const iconColor = useColorModeValue('gray.600', 'white');
  const appBgLight = useColorModeValue('brand.100', 'whiteAlpha.100');

  if (loading || !data?.userAppAccess) {
    return null;
  }

  const { hasAdminAccess, hasPartnerAccess, hasZentinelleAccess, hasInternalAccess, organizationName, partnerName } = data.userAppAccess;

  const apps: AppOption[] = [];

  if (hasAdminAccess) {
    apps.push({
      name: 'Client Cove',
      description: organizationName || 'Organization Admin',
      icon: MdDashboard,
      href: '/admin/dashboard',
      color: 'brand.500',
    });
  }

  if (hasZentinelleAccess) {
    apps.push({
      name: 'Zentinelle',
      description: 'Agent Governance',
      icon: MdSmartToy,
      href: '/zentinelle/agents',
      color: 'purple.500',
    });
  }

  if (hasPartnerAccess) {
    apps.push({
      name: 'Partner Portal',
      description: partnerName || 'Partner Dashboard',
      icon: MdHandshake,
      href: '/partner/dashboard',
      color: 'green.500',
    });
  }

  if (hasInternalAccess) {
    apps.push({
      name: 'Internal Admin',
      description: 'Calliope Staff Only',
      icon: MdAdminPanelSettings,
      href: '/internal/organizations',
      color: 'orange.500',
      badge: 'Staff',
    });
  }

  if (apps.length < 2 && !hasInternalAccess) {
    return null;
  }

  const handleNavigate = (href: string) => {
    const baseUrl = window.location.origin;
    window.location.href = `${baseUrl}${href}`;
  };

  return (
    <Menu>
      <MenuButton
        p="0px"
        me="10px"
        borderRadius="8px"
        _hover={{ bg: hoverBg }}
      >
        <Flex align="center" justify="center" w="37px" h="37px" borderRadius="8px">
          <Icon as={MdApps} color={iconColor} w="24px" h="24px" />
        </Flex>
      </MenuButton>
      <MenuList
        boxShadow={shadow}
        p="0px"
        mt="10px"
        borderRadius="20px"
        bg={menuBg}
        border="none"
        minW="280px"
      >
        <Flex w="100%" mb="0px">
          <Text
            ps="20px" pt="16px" pb="10px" w="100%"
            borderBottom="1px solid" borderColor={borderColor}
            fontSize="sm" fontWeight="700" color={textColor}
          >
            Switch App
          </Text>
        </Flex>
        <Flex flexDirection="column" p="10px">
          {apps.map((app) => (
            <MenuItem
              key={app.name}
              _hover={{ bg: hoverBg }}
              _focus={{ bg: 'none' }}
              borderRadius="8px"
              px="14px" py="10px"
              onClick={() => handleNavigate(app.href)}
            >
              <Flex align="center" w="100%">
                <Flex align="center" justify="center" w="40px" h="40px" borderRadius="10px" bg={appBgLight} me="12px">
                  <Icon as={app.icon} color={app.color} w="20px" h="20px" />
                </Flex>
                <Box flex="1">
                  <Flex align="center" gap="2">
                    <Text fontSize="sm" fontWeight="600" color={textColor}>{app.name}</Text>
                    {app.badge && (
                      <Badge colorScheme="orange" fontSize="2xs" borderRadius="4px">{app.badge}</Badge>
                    )}
                  </Flex>
                  <Text fontSize="xs" color="gray.500">{app.description}</Text>
                </Box>
                <Icon as={MdOpenInNew} color="gray.400" w="14px" h="14px" />
              </Flex>
            </MenuItem>
          ))}
        </Flex>
      </MenuList>
    </Menu>
  );
}
