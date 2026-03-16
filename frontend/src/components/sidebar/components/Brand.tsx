// Chakra imports
import { Flex, Text, useColorModeValue, Box } from '@chakra-ui/react';

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
        <Box>
          <Text fontSize="2xl" fontWeight="800" color={logoColor} lineHeight="1.1">
            Zentinelle
          </Text>
          <Text fontSize="xs" color={subtitleColor} mt="1px">
            by Calliope Labs Inc
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
        <Text fontSize="lg" fontWeight="800" color={logoColor}>
          Z
        </Text>
      </Flex>
      <HSeparator mb="20px" />
    </Flex>
  );
}

export default SidebarBrand;
