'use client';

import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Divider,
  Flex,
  Text,
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
  const dividerColor = useColorModeValue('gray.200', 'whiteAlpha.200');

  const activeRoute = (routePath: string, layout: string) => {
    const fullPath = layout + routePath;
    return pathname === fullPath || pathname.startsWith(fullPath + '/');
  };

  const groupHasActiveChild = (items: IRoute[]) =>
    items.some((item) => activeRoute(item.path, item.layout || ''));

  const showExpanded = (items: IRoute[]) =>
    groupHasActiveChild(items) ? [0] : undefined;

  const renderFlatRoute = (route: IRoute, key: number) => {
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
        position="relative"
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
  };

  const createLinks = (routes: IRoute[]) => {
    let dividerInserted = false;

    return routes.map((route, key) => {
      if (route.collapse && route.items) {
        const defaultIndex = showExpanded(route.items);
        return (
          <Accordion
            allowToggle
            key={key}
            defaultIndex={defaultIndex}
          >
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
              <AccordionPanel pb="8px" ps="10px">
                {route.items.map((item, idx) => {
                  const isActive = activeRoute(item.path, item.layout || '');
                  return (
                    <Flex
                      key={idx}
                      align="center"
                      py="8px"
                      px="10px"
                      borderRadius="8px"
                      mb="4px"
                      cursor="pointer"
                      bg={isActive ? activeBg : 'transparent'}
                      boxShadow={isActive ? '0px 7px 23px rgba(0, 0, 0, 0.05)' : 'none'}
                      _hover={{ bg: activeBg }}
                      onClick={() => router.push((item.layout || '') + item.path)}
                      position="relative"
                    >
                      <Box
                        color={isActive ? activeIcon : inactiveColor}
                        flexShrink={0}
                      >
                        {item.icon}
                      </Box>
                      {(mini === false || (mini === true && hovered === true)) && (
                        <Text
                          me="auto"
                          color={isActive ? activeColor : inactiveColor}
                          fontSize="sm"
                          fontWeight={isActive ? '600' : '500'}
                          ms="10px"
                        >
                          {item.name}
                        </Text>
                      )}
                      {isActive && (
                        <Box
                          h="28px"
                          w="4px"
                          bg="brand.500"
                          borderRadius="5px"
                          position="absolute"
                          right="0px"
                        />
                      )}
                    </Flex>
                  );
                })}
              </AccordionPanel>
            </AccordionItem>
          </Accordion>
        );
      }

      // Flat route — insert divider before first secondary item
      const needsDivider = route.secondary && !dividerInserted;
      if (needsDivider) dividerInserted = true;

      return (
        <Box key={key}>
          {needsDivider && (
            <Divider
              borderColor={dividerColor}
              mb="12px"
              mt="4px"
            />
          )}
          {renderFlatRoute(route, key)}
        </Box>
      );
    });
  };

  return <>{createLinks(routes)}</>;
}

export default Links;
