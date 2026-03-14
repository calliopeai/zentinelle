'use client';

import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Flex,
  HStack,
  Text,
  List,
  ListItem,
  useColorModeValue,
} from '@chakra-ui/react';
import { usePathname, useRouter } from 'next/navigation';
import { IRoute } from 'types/navigation';

function Links(props: {
  routes: IRoute[];
  mini?: boolean;
  hovered?: boolean;
}) {
  const { routes, mini, hovered } = props;
  const pathname = usePathname();
  const router = useRouter();

  const activeColor = useColorModeValue('gray.700', 'white');
  const inactiveColor = useColorModeValue('secondaryGray.600', 'secondaryGray.600');
  const activeIcon = useColorModeValue('brand.500', 'white');
  const activeBg = useColorModeValue('white', 'navy.700');

  const activeRoute = (routeName: string, layout: string) => {
    const fullPath = layout + routeName;
    return pathname === fullPath || pathname.startsWith(fullPath + '/');
  };

  const createLinks = (routes: IRoute[]) => {
    return routes.map((route, key) => {
      if (route.collapse) {
        return (
          <Accordion allowToggle key={key}>
            <AccordionItem border="none" mb="8px">
              <AccordionButton
                py="12px"
                px="10px"
                borderRadius="8px"
                _hover={{ bg: activeBg }}
              >
                <Flex align="center" flex="1">
                  <Box color={inactiveColor}>{route.icon}</Box>
                  {(mini === false || (mini === true && hovered === true)) && (
                    <Text
                      me="auto"
                      color={inactiveColor}
                      fontSize="sm"
                      fontWeight="500"
                      ms="10px"
                    >
                      {route.name}
                    </Text>
                  )}
                </Flex>
                {(mini === false || (mini === true && hovered === true)) && (
                  <AccordionIcon color={inactiveColor} />
                )}
              </AccordionButton>
              <AccordionPanel pb="8px" ps="30px">
                <List>
                  {route.items &&
                    route.items.map((item, idx) => {
                      const isActive = activeRoute(item.path, item.layout || '');
                      return (
                        <ListItem
                          key={idx}
                          cursor="pointer"
                          py="6px"
                          onClick={() => router.push((item.layout || '') + item.path)}
                        >
                          <Text
                            color={isActive ? activeColor : inactiveColor}
                            fontWeight={isActive ? '600' : '400'}
                            fontSize="sm"
                          >
                            {item.name}
                          </Text>
                        </ListItem>
                      );
                    })}
                </List>
              </AccordionPanel>
            </AccordionItem>
          </Accordion>
        );
      }

      const isActive = activeRoute(route.path, route.layout || '');

      return (
        <Flex
          key={key}
          align="center"
          py="12px"
          px="10px"
          borderRadius="8px"
          mb="8px"
          cursor="pointer"
          bg={isActive ? activeBg : 'transparent'}
          boxShadow={isActive ? '0px 7px 23px rgba(0, 0, 0, 0.05)' : 'none'}
          _hover={{ bg: activeBg }}
          onClick={() => router.push((route.layout || '') + route.path)}
        >
          <Box color={isActive ? activeIcon : inactiveColor}>{route.icon}</Box>
          {(mini === false || (mini === true && hovered === true)) && (
            <Text
              me="auto"
              color={isActive ? activeColor : inactiveColor}
              fontSize="sm"
              fontWeight={isActive ? '600' : '500'}
              ms="10px"
            >
              {route.name}
            </Text>
          )}
          {isActive && (
            <Box
              h="36px"
              w="4px"
              bg="brand.500"
              borderRadius="5px"
              position="absolute"
              right="0px"
            />
          )}
        </Flex>
      );
    });
  };

  return <>{createLinks(routes)}</>;
}

export default Links;
