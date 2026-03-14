'use client';

import { Box, useStyleConfig } from '@chakra-ui/react';

function Card(props: {
  variant?: string;
  [x: string]: any;
}) {
  const { variant, children, ...rest } = props;
  const styles = useStyleConfig('Card', { variant });

  return (
    <Box __css={styles} {...rest}>
      {children}
    </Box>
  );
}

export default Card;
