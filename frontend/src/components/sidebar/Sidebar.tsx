'use client';

import React from 'react';
import {
  Box,
  Flex,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerOverlay,
  useColorModeValue,
  useDisclosure,
} from '@chakra-ui/react';
import { Scrollbars } from 'react-custom-scrollbars-2';
import { IRoute } from 'types/navigation';
import Links from './components/Links';
import { SidebarBrand } from './components/Brand';
import {
  renderTrack,
  renderThumb,
  renderView,
  renderViewMini,
} from 'components/scrollbar/Scrollbar';

function SidebarContent(props: {
  routes: IRoute[];
  hovered?: boolean;
  mini?: boolean;
}) {
  const { routes, mini, hovered } = props;

  return (
    <Flex
      direction="column"
      height="100%"
      pt="25px"
      borderRadius="30px"
    >
      {/* Logo */}
      <SidebarBrand mini={mini ?? false} hovered={hovered ?? false} />

      {/* Nav Items */}
      <Box ps="20px" pe={{ lg: '16px', '2xl': '16px' }}>
        <Links mini={mini} hovered={hovered} routes={routes} />
      </Box>
    </Flex>
  );
}

export default function Sidebar(props: {
  routes: IRoute[];
  mini: boolean;
  hovered: boolean;
  setHovered: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const { routes, mini, hovered, setHovered } = props;

  const variantChange = '0.2s linear';
  const sidebarBg = useColorModeValue('white', 'navy.800');
  const sidebarRadius = '30px';
  const sidebarMargins = '0px';

  return (
    <Box display={{ sm: 'none', xl: 'block' }} position="fixed" minH="100%">
      <Box
        bg={sidebarBg}
        transition={variantChange}
        w={mini === false ? '290px' : mini === true && hovered === true ? '290px' : '120px'}
        ms={{ sm: '16px' }}
        my={{ sm: '16px' }}
        h="calc(100vh - 32px)"
        m={sidebarMargins}
        borderRadius={sidebarRadius}
        minH="100%"
        overflowX="hidden"
        boxShadow="14px 17px 40px 4px rgba(112, 144, 176, 0.08)"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <Scrollbars
          autoHide
          renderTrackVertical={renderTrack}
          renderThumbVertical={renderThumb}
          renderView={
            mini === false
              ? renderView
              : mini === true && hovered === true
              ? renderView
              : renderViewMini
          }
        >
          <SidebarContent mini={mini} hovered={hovered} routes={routes} />
        </Scrollbars>
      </Box>
    </Box>
  );
}
