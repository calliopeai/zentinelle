// Chakra imports
import { Flex, Text, useColorModeValue, Box } from '@chakra-ui/react';
import { Image } from 'components/image/Image';

// Custom components
import { HSeparator } from 'components/separator/Separator';

export function SidebarBrand(props: { mini: boolean; hovered: boolean }) {
  const { mini, hovered } = props;
  let logoColor = useColorModeValue('navy.700', 'white');
  let subtitleColor = useColorModeValue('gray.500', 'secondaryGray.600');

  return (
    <Flex alignItems="center" flexDirection="column">
      <Flex
        my="32px"
        align="center"
        gap="12px"
        display={
          mini === false
            ? 'flex'
            : mini === true && hovered === true
            ? 'flex'
            : 'none'
        }
      >
        <Image
          src="/img/calliope.svg"
          alt="Calliope AI"
          w="40px"
          h="40px"
        />
        <Box>
          <Text fontSize="xl" fontWeight="800" color={logoColor}>
            Calliope AI
          </Text>
          <Text fontSize="xs" color={subtitleColor} mt="-2px">
            Zentinelle
          </Text>
        </Box>
      </Flex>
      <Flex
        display={
          mini === false
            ? 'none'
            : mini === true && hovered === true
            ? 'none'
            : 'flex'
        }
        my="32px"
      >
        <Image
          src="/img/calliope.svg"
          alt="Calliope AI"
          w="40px"
          h="40px"
        />
      </Flex>
      <HSeparator mb="20px" />
    </Flex>
  );
}

export default SidebarBrand;
