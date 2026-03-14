'use client';

import { Flex, Text, useColorModeValue } from '@chakra-ui/react';

export default function Footer() {
  const textColor = useColorModeValue('gray.500', 'white');

  return (
    <Flex
      zIndex="3"
      flexDirection={{
        base: 'column',
        lg: 'row',
      }}
      alignItems={{
        base: 'center',
        xl: 'start',
      }}
      justifyContent="space-between"
      px={{ base: '30px', md: '0px' }}
      pb="30px"
    >
      <Text
        color={textColor}
        textAlign={{
          base: 'center',
          xl: 'start',
        }}
        mb={{ base: '20px', lg: '0px' }}
      >
        {new Date().getFullYear()} Calliope AI. Zentinelle.
      </Text>
    </Flex>
  );
}
