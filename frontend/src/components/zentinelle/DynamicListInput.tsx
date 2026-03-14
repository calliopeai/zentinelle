'use client';

import {
  Box,
  VStack,
  HStack,
  Button,
  Textarea,
  Input,
  IconButton,
  Text,
  FormControl,
  FormLabel,
  FormHelperText,
  useColorModeValue,
} from '@chakra-ui/react';
import { MdAdd, MdDelete } from 'react-icons/md';
import { useState, useEffect } from 'react';

interface DynamicListInputProps {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  helperText?: string;
  inputType?: 'input' | 'textarea';
  minItems?: number;
  maxItems?: number;
  addButtonText?: string;
}

/**
 * A dynamic list input component that allows users to add/remove items.
 * Starts with a minimal number of inputs and allows adding more via AJAX-style buttons.
 */
export default function DynamicListInput({
  label,
  value = [],
  onChange,
  placeholder = 'Enter value...',
  helperText,
  inputType = 'textarea',
  minItems = 1,
  maxItems = 20,
  addButtonText = 'Add Item',
}: DynamicListInputProps) {
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.200');
  const hoverBg = useColorModeValue('gray.50', 'whiteAlpha.50');
  const labelColor = useColorModeValue('gray.700', 'gray.200');

  // Initialize with minimum items if value is empty
  const [items, setItems] = useState<string[]>(() => {
    if (value.length === 0) {
      return Array(minItems).fill('');
    }
    return value;
  });

  // Sync with parent value
  useEffect(() => {
    if (value.length > 0) {
      setItems(value);
    }
  }, [value]);

  // Update parent when items change
  const updateParent = (newItems: string[]) => {
    setItems(newItems);
    // Filter out empty strings when sending to parent
    onChange(newItems.filter((item) => item.trim() !== ''));
  };

  const handleItemChange = (index: number, newValue: string) => {
    const newItems = [...items];
    newItems[index] = newValue;
    updateParent(newItems);
  };

  const handleAddItem = () => {
    if (items.length < maxItems) {
      const newItems = [...items, ''];
      setItems(newItems);
    }
  };

  const handleRemoveItem = (index: number) => {
    if (items.length > minItems) {
      const newItems = items.filter((_, i) => i !== index);
      updateParent(newItems);
    }
  };

  const canAdd = items.length < maxItems;
  const canRemove = items.length > minItems;

  return (
    <FormControl>
      <FormLabel color={labelColor}>{label}</FormLabel>
      <VStack align="stretch" spacing="12px">
        {items.map((item, index) => (
          <HStack key={index} align="start" spacing="8px">
            <Box
              minW="28px"
              h="28px"
              display="flex"
              alignItems="center"
              justifyContent="center"
              borderRadius="md"
              bg={item.trim() ? 'brand.50' : 'gray.100'}
              color={item.trim() ? 'brand.600' : 'gray.500'}
              fontSize="sm"
              fontWeight="500"
            >
              {index + 1}
            </Box>
            <Box flex="1">
              {inputType === 'textarea' ? (
                <Textarea
                  value={item}
                  onChange={(e) => handleItemChange(index, e.target.value)}
                  placeholder={`${placeholder} ${index + 1}`}
                  rows={3}
                  size="sm"
                  borderColor={borderColor}
                  _hover={{ borderColor: 'brand.400' }}
                  _focus={{ borderColor: 'brand.500', boxShadow: '0 0 0 1px var(--chakra-colors-brand-500)' }}
                />
              ) : (
                <Input
                  value={item}
                  onChange={(e) => handleItemChange(index, e.target.value)}
                  placeholder={`${placeholder} ${index + 1}`}
                  size="sm"
                  borderColor={borderColor}
                  _hover={{ borderColor: 'brand.400' }}
                  _focus={{ borderColor: 'brand.500', boxShadow: '0 0 0 1px var(--chakra-colors-brand-500)' }}
                />
              )}
            </Box>
            {canRemove && (
              <IconButton
                aria-label="Remove item"
                icon={<MdDelete />}
                size="sm"
                variant="ghost"
                colorScheme="red"
                onClick={() => handleRemoveItem(index)}
                _hover={{ bg: 'red.50' }}
              />
            )}
          </HStack>
        ))}

        {canAdd && (
          <Button
            leftIcon={<MdAdd />}
            variant="ghost"
            size="sm"
            onClick={handleAddItem}
            alignSelf="flex-start"
            colorScheme="brand"
            _hover={{ bg: hoverBg }}
          >
            {addButtonText}
          </Button>
        )}
      </VStack>
      {helperText && <FormHelperText>{helperText}</FormHelperText>}
      <Text fontSize="xs" color="gray.500" mt="4px">
        {items.filter((i) => i.trim()).length} of {maxItems} items used
      </Text>
    </FormControl>
  );
}
