'use client';

import {
  Box,
  Text,
  Badge,
  Flex,
  useColorModeValue,
  IconButton,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverBody,
  PopoverFooter,
  VStack,
  Button,
  Divider,
  Spinner,
} from '@chakra-ui/react';
import { MdNotifications, MdCheck } from 'react-icons/md';
import { useQuery, useMutation } from '@apollo/client';
import { GET_NOTIFICATIONS, MARK_NOTIFICATION_READ } from 'graphql/notifications';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

interface Notification {
  id: string;
  subject: string;
  message: string;
  status: string;
  statusDate: string;
  createdAt: string;
}

function NotificationItem({
  notification,
  onMarkRead,
}: {
  notification: Notification;
  onMarkRead: (id: string) => void;
}) {
  const textColor = useColorModeValue('gray.700', 'white');
  const secondaryText = useColorModeValue('gray.500', 'gray.400');
  const hoverBg = useColorModeValue('gray.50', 'whiteAlpha.100');
  const isUnread = notification.status === 'UNREAD';

  return (
    <Box
      p={3}
      _hover={{ bg: hoverBg }}
      cursor="pointer"
      borderRadius="md"
      position="relative"
      onClick={() => isUnread && onMarkRead(notification.id)}
    >
      {isUnread && (
        <Box
          position="absolute"
          left={1}
          top="50%"
          transform="translateY(-50%)"
          w={2}
          h={2}
          borderRadius="full"
          bg="brand.500"
        />
      )}
      <Box pl={isUnread ? 3 : 0}>
        <Text
          fontWeight={isUnread ? '600' : '400'}
          color={textColor}
          fontSize="sm"
          noOfLines={1}
        >
          {notification.subject}
        </Text>
        <Text color={secondaryText} fontSize="xs" noOfLines={2} mt={0.5}>
          {notification.message}
        </Text>
        <Text color={secondaryText} fontSize="xs" mt={1}>
          {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
        </Text>
      </Box>
    </Box>
  );
}

export default function NotificationsDropdown() {
  const textColor = useColorModeValue('gray.700', 'white');
  const secondaryText = useColorModeValue('gray.500', 'gray.400');
  const bgColor = useColorModeValue('white', 'navy.800');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.100');

  const { data, loading, refetch } = useQuery(GET_NOTIFICATIONS, {
    variables: { first: 10 },
    pollInterval: 60000,
  });

  const [markRead] = useMutation(MARK_NOTIFICATION_READ, {
    onCompleted: () => refetch(),
  });

  const notifications: Notification[] = data?.notifications?.edges?.map(
    (edge: any) => edge.node
  ) || [];

  const unreadCount = notifications.filter((n) => n.status === 'UNREAD').length;

  const handleMarkRead = (id: string) => {
    markRead({ variables: { id } });
  };

  return (
    <Popover placement="bottom-end">
      <PopoverTrigger>
        <Box position="relative" me="10px">
          <IconButton
            aria-label="Notifications"
            icon={<MdNotifications />}
            variant="ghost"
            fontSize="20px"
            color={secondaryText}
            size="sm"
            _hover={{ bg: useColorModeValue('gray.100', 'whiteAlpha.100') }}
          />
          {unreadCount > 0 && (
            <Badge
              position="absolute"
              top="-2px"
              right="-2px"
              colorScheme="red"
              borderRadius="full"
              fontSize="9px"
              minW="16px"
              h="16px"
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Box>
      </PopoverTrigger>
      <PopoverContent
        w="340px"
        bg={bgColor}
        borderColor={borderColor}
        boxShadow="lg"
      >
        <PopoverHeader fontWeight="600" borderColor={borderColor}>
          <Flex justify="space-between" align="center">
            <Text color={textColor}>Notifications</Text>
            {unreadCount > 0 && (
              <Badge colorScheme="brand" fontSize="xs">
                {unreadCount} new
              </Badge>
            )}
          </Flex>
        </PopoverHeader>
        <PopoverBody p={0} maxH="350px" overflowY="auto">
          {loading ? (
            <Flex justify="center" py={8}>
              <Spinner size="sm" />
            </Flex>
          ) : notifications.length === 0 ? (
            <Box p={6} textAlign="center">
              <Text color={secondaryText} fontSize="sm">
                No notifications yet
              </Text>
            </Box>
          ) : (
            <VStack spacing={0} align="stretch" divider={<Divider borderColor={borderColor} />}>
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkRead={handleMarkRead}
                />
              ))}
            </VStack>
          )}
        </PopoverBody>
        <PopoverFooter borderColor={borderColor}>
          <Button
            as={Link}
            href="/settings/"
            variant="ghost"
            size="sm"
            w="full"
          >
            View All Notifications
          </Button>
        </PopoverFooter>
      </PopoverContent>
    </Popover>
  );
}
