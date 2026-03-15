'use client';

import {
  Box,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  Center,
  Flex,
  Icon,
  Link,
  Menu,
  MenuButton,
  MenuDivider,
  MenuItem,
  MenuList,
  Text,
  useColorMode,
  useColorModeValue,
} from '@chakra-ui/react';
import { useAuth } from 'contexts/AuthContext';
import { IoMdMoon, IoMdSunny } from 'react-icons/io';
import { MdSettings, MdLogout } from 'react-icons/md';
import NotificationsDropdown from 'components/notifications/NotificationsDropdown';
import AppSwitcher from 'components/navbar/AppSwitcher';
import { clearSessionKey } from 'utils/session';

export default function AdminNavbar(props: {
  secondary?: boolean;
  brandText: string;
  logoText: string;
  fixed?: boolean;
  onOpen?: () => void;
}) {
  const { secondary, brandText } = props;
  const { user, isAuthenticated } = useAuth();
  const { colorMode, toggleColorMode } = useColorMode();

  const navbarPosition = 'fixed' as const;
  const navbarFilter = 'none';
  const navbarBackdrop = 'blur(20px)';
  const navbarShadow = 'none';
  const navbarBg = useColorModeValue(
    'rgba(244, 247, 254, 0.2)',
    'rgba(11, 20, 55, 0.5)',
  );
  const navbarBorder = 'transparent';
  const secondaryMargin = '0px';
  const paddingX = '15px';
  const gap = '0px';
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const menuBg = useColorModeValue('white', 'navy.800');
  const shadow = useColorModeValue(
    '14px 17px 40px 4px rgba(112, 144, 176, 0.18)',
    '14px 17px 40px 4px rgba(112, 144, 176, 0.06)',
  );
  const borderColor = useColorModeValue('#E6ECFA', 'rgba(135, 140, 189, 0.3)');
  const navbarIcon = useColorModeValue('secondaryGray.600', 'white');

  const handleLogout = async () => {
    await clearSessionKey();
    window.location.href = '/zentinelle/api/auth/logout';
  };

  const getUserInitials = () => {
    if (!user) return '?';
    if (user.name) {
      const parts = user.name.split(' ');
      if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }
      return user.name[0].toUpperCase();
    }
    if (user.email) {
      return user.email[0].toUpperCase();
    }
    return '?';
  };

  const getUserDisplayName = () => {
    if (!user) return 'Guest';
    return user.name || user.email || 'User';
  };

  return (
    <Box
      position={navbarPosition}
      boxShadow={navbarShadow}
      bg={navbarBg}
      borderColor={navbarBorder}
      filter={navbarFilter}
      backdropFilter={navbarBackdrop}
      backgroundPosition="center"
      backgroundSize="cover"
      borderRadius="16px"
      borderWidth="1.5px"
      borderStyle="solid"
      transitionDelay="0s, 0s, 0s, 0s"
      transitionDuration=" 0.25s, 0.25s, 0.25s, 0s"
      transition-property="box-shadow, background-color, filter, border"
      transitionTimingFunction="linear, linear, linear, linear"
      alignItems={{ xl: 'center' }}
      display={secondary ? 'block' : 'flex'}
      minH="75px"
      justifyContent={{ xl: 'center' }}
      lineHeight="25.6px"
      mx="auto"
      mt={secondaryMargin}
      pb="8px"
      right={{ base: '12px', md: '30px', lg: '30px', xl: '30px' }}
      px={{ sm: paddingX, md: '10px' }}
      ps={{ xl: '12px' }}
      pt="8px"
      top={{ base: '12px', md: '16px', xl: '18px' }}
      w={{
        base: 'calc(100vw - 6%)',
        md: 'calc(100vw - 8%)',
        lg: 'calc(100vw - 6%)',
        xl: 'calc(100vw - 350px)',
        '2xl': 'calc(100vw - 365px)',
      }}
    >
      <Flex
        w="100%"
        flexDirection={{ sm: 'column', md: 'row' }}
        alignItems={{ xl: 'center' }}
        mb={gap}
      >
        <Box mb={{ sm: '8px', md: '0px' }}>
          <Breadcrumb>
            <BreadcrumbItem color={textColor} fontSize="sm" mb="5px">
              <BreadcrumbLink href="/zentinelle/agents/" color={textColor}>
                Zentinelle
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbItem color={textColor} fontSize="sm" mb="5px">
              <BreadcrumbLink href="#" color={textColor}>
                {brandText}
              </BreadcrumbLink>
            </BreadcrumbItem>
          </Breadcrumb>
          <Link
            color={textColor}
            href="#"
            bg="inherit"
            borderRadius="inherit"
            fontWeight="bold"
            fontSize="34px"
            _hover={{ color: textColor }}
            _active={{ bg: 'inherit', transform: 'none', borderColor: 'transparent' }}
            _focus={{ boxShadow: 'none' }}
          >
            {brandText}
          </Link>
        </Box>
        <Box ms="auto" w={{ sm: '100%', md: 'unset' }}>
          {isAuthenticated && (
            <Flex
              w={{ sm: '100%', md: 'auto' }}
              alignItems="center"
              flexDirection="row"
              bg={menuBg}
              p="10px"
              borderRadius="30px"
              boxShadow={shadow}
            >
              <AppSwitcher />
              <Box onClick={toggleColorMode} cursor="pointer" me="10px" display="flex" alignItems="center">
                <Icon as={colorMode === 'light' ? IoMdMoon : IoMdSunny} color={navbarIcon} w="18px" h="18px" />
              </Box>
              <NotificationsDropdown />
              <Menu>
                <MenuButton p="0px" style={{ position: 'relative' }}>
                  <Box _hover={{ cursor: 'pointer' }} color="white" bg="#11047A" w="40px" h="40px" borderRadius="50%" />
                  <Center top={0} left={0} position="absolute" w="100%" h="100%">
                    <Text fontSize="xs" fontWeight="bold" color="white">{getUserInitials()}</Text>
                  </Center>
                </MenuButton>
                <MenuList boxShadow={shadow} p="0px" mt="10px" borderRadius="20px" bg={menuBg} border="none">
                  <Flex w="100%" mb="0px">
                    <Text ps="20px" pt="16px" pb="10px" w="100%" borderBottom="1px solid" borderColor={borderColor} fontSize="sm" fontWeight="700" color={textColor}>
                      {getUserDisplayName()}
                    </Text>
                  </Flex>
                  <Flex flexDirection="column" p="10px">
                    <Link href="/zentinelle/settings/">
                      <MenuItem _hover={{ bg: 'none' }} _focus={{ bg: 'none' }} borderRadius="8px" px="14px">
                        <Flex align="center" gap="2">
                          <Icon as={MdSettings} color={navbarIcon} />
                          <Text fontSize="sm">Settings</Text>
                        </Flex>
                      </MenuItem>
                    </Link>
                    <MenuDivider />
                    <MenuItem _hover={{ bg: 'none' }} _focus={{ bg: 'none' }} borderRadius="8px" px="14px" color="red.500" onClick={handleLogout}>
                      <Flex align="center" gap="2">
                        <Icon as={MdLogout} />
                        <Text fontSize="sm">Log out</Text>
                      </Flex>
                    </MenuItem>
                  </Flex>
                </MenuList>
              </Menu>
            </Flex>
          )}
        </Box>
      </Flex>
    </Box>
  );
}
