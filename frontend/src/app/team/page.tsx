'use client';

import {
  Box,
  Button,
  Flex,
  Heading,
  Icon,
  Input,
  InputGroup,
  InputLeftElement,
  SimpleGrid,
  Spinner,
  Text,
  useColorModeValue,
  Avatar,
  Badge,
  IconButton,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  FormControl,
  FormLabel,
  Select,
  useToast,
} from '@chakra-ui/react';
import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { MdAdd, MdSearch, MdMoreVert, MdDelete, MdEdit, MdEmail, MdRefresh } from 'react-icons/md';
import Card from 'components/card/Card';
import {
  GET_TEAM_MEMBERS,
  INVITE_TEAM_MEMBER,
  UPDATE_TEAM_MEMBER,
  REMOVE_TEAM_MEMBER,
  RESEND_INVITATION,
} from 'graphql/team';

interface TeamMember {
  id: string;
  userId: string | null;
  email: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  role: string;
  status: string;
  invitedAt: string | null;
  joinedAt: string | null;
  lastActiveAt: string | null;
  avatarUrl: string | null;
}

function getRoleColor(role: string): string {
  switch (role) {
    case 'admin':
      return 'purple';
    case 'member':
      return 'blue';
    default:
      return 'gray';
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'active':
      return 'green';
    case 'pending':
      return 'yellow';
    case 'inactive':
      return 'gray';
    default:
      return 'gray';
  }
}

function timeAgo(dateString: string | null): string {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function TeamPage() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');

  const { isOpen: isInviteOpen, onOpen: onInviteOpen, onClose: onInviteClose } = useDisclosure();

  const cardBg = useColorModeValue('white', 'navy.800');
  const textColor = useColorModeValue('secondaryGray.900', 'white');
  const borderColor = useColorModeValue('gray.200', 'whiteAlpha.100');

  // Fetch team members
  const { data, loading, refetch } = useQuery(GET_TEAM_MEMBERS, {
    variables: { search: debouncedSearch || undefined, first: 50 },
    fetchPolicy: 'cache-and-network',
  });

  // Mutations
  const [inviteTeamMember, { loading: inviting }] = useMutation(INVITE_TEAM_MEMBER, {
    onCompleted: (result) => {
      if (result.inviteTeamMember?.teamMember) {
        toast({ title: `Invitation sent to ${inviteEmail}`, status: 'success' });
        setInviteEmail('');
        setInviteRole('member');
        onInviteClose();
        refetch();
      } else {
        toast({ title: 'Failed to invite', description: result.inviteTeamMember?.errors?.join(', '), status: 'error' });
      }
    },
    onError: (err) => toast({ title: 'Error', description: err.message, status: 'error' }),
  });

  const [removeTeamMember] = useMutation(REMOVE_TEAM_MEMBER, {
    onCompleted: (result) => {
      if (result.removeTeamMember?.success) {
        toast({ title: 'Member removed', status: 'success' });
        refetch();
      } else {
        toast({ title: 'Failed to remove', description: result.removeTeamMember?.errors?.join(', '), status: 'error' });
      }
    },
    onError: (err) => toast({ title: 'Error', description: err.message, status: 'error' }),
  });

  const [resendInvitation] = useMutation(RESEND_INVITATION, {
    onCompleted: (result) => {
      if (result.resendInvitation?.success) {
        toast({ title: 'Invitation resent', status: 'success' });
      } else {
        toast({ title: 'Failed to resend', description: result.resendInvitation?.errors?.join(', '), status: 'error' });
      }
    },
    onError: (err) => toast({ title: 'Error', description: err.message, status: 'error' }),
  });

  // Extract members from query
  const members: TeamMember[] = useMemo(() => {
    return data?.teamMembers?.edges?.map((edge: { node: TeamMember }) => edge.node) || [];
  }, [data]);

  // Debounce search
  const handleSearchChange = (value: string) => {
    setSearch(value);
    // Simple debounce
    setTimeout(() => setDebouncedSearch(value), 300);
  };

  const handleInvite = () => {
    if (!inviteEmail) {
      toast({ title: 'Please enter an email address', status: 'warning' });
      return;
    }
    inviteTeamMember({
      variables: {
        input: { email: inviteEmail, role: inviteRole },
      },
    });
  };

  const handleRemove = (id: string) => {
    if (confirm('Are you sure you want to remove this team member?')) {
      removeTeamMember({ variables: { id } });
    }
  };

  const handleResendInvite = (id: string) => {
    resendInvitation({ variables: { id } });
  };

  return (
    <Box pt={{ base: '130px', md: '80px', xl: '80px' }}>
      {/* Header */}
      <Flex justify="space-between" align="center" mb="20px">
        <Box>
          <Heading size="lg" color={textColor}>
            Team Members
          </Heading>
          <Text fontSize="sm" color="secondaryGray.600">
            Manage your organization's team and permissions
          </Text>
        </Box>
        <Flex gap="12px">
          <IconButton
            aria-label="Refresh"
            icon={<MdRefresh />}
            variant="outline"
            onClick={() => refetch()}
            isLoading={loading}
          />
          <Button
            variant="brand"
            leftIcon={<Icon as={MdAdd} />}
            onClick={onInviteOpen}
          >
            Invite Member
          </Button>
        </Flex>
      </Flex>

      {/* Search */}
      <Card p="20px" mb="24px" bg={cardBg}>
        <Flex gap="16px" flexWrap="wrap" align="center" justify="space-between">
          <InputGroup maxW="300px">
            <InputLeftElement>
              <Icon as={MdSearch} color="gray.400" />
            </InputLeftElement>
            <Input
              placeholder="Search members..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </InputGroup>
          <Flex align="center" gap="8px">
            {loading && <Spinner size="sm" color="brand.500" />}
            <Text color="gray.500" fontSize="sm">
              {members.length} member{members.length !== 1 ? 's' : ''}
            </Text>
          </Flex>
        </Flex>
      </Card>

      {/* Loading State */}
      {loading && members.length === 0 && (
        <Flex justify="center" py="40px">
          <Spinner size="xl" color="brand.500" />
        </Flex>
      )}

      {/* Empty State */}
      {!loading && members.length === 0 && (
        <Card p="40px" bg={cardBg} textAlign="center">
          <Text color="gray.500" mb="16px">
            {search ? 'No members match your search' : 'No team members yet'}
          </Text>
          {!search && (
            <Button variant="brand" onClick={onInviteOpen}>
              Invite Your First Member
            </Button>
          )}
        </Card>
      )}

      {/* Team Members Grid */}
      <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing="20px">
        {members.map((member) => (
          <Card key={member.id} p="20px" bg={cardBg}>
            <Flex justify="space-between" align="start" mb="16px">
              <Flex align="center" gap="12px">
                <Avatar
                  name={member.fullName || member.email}
                  src={member.avatarUrl || undefined}
                  size="md"
                  bg="brand.500"
                />
                <Box>
                  <Text fontWeight="600" color={textColor}>
                    {member.fullName || member.email.split('@')[0]}
                  </Text>
                  <Text fontSize="sm" color="gray.500">
                    {member.email}
                  </Text>
                </Box>
              </Flex>
              <Menu>
                <MenuButton
                  as={IconButton}
                  icon={<MdMoreVert />}
                  variant="ghost"
                  size="sm"
                />
                <MenuList>
                  <MenuItem icon={<MdEdit />}>Change Role</MenuItem>
                  {member.status === 'pending' && (
                    <MenuItem icon={<MdEmail />} onClick={() => handleResendInvite(member.id)}>
                      Resend Invite
                    </MenuItem>
                  )}
                  <MenuItem icon={<MdDelete />} color="red.500" onClick={() => handleRemove(member.id)}>
                    Remove
                  </MenuItem>
                </MenuList>
              </Menu>
            </Flex>

            <Flex gap="8px" mb="12px">
              <Badge colorScheme={getRoleColor(member.role)}>
                {member.role}
              </Badge>
              <Badge colorScheme={getStatusColor(member.status)}>
                {member.status}
              </Badge>
            </Flex>

            <Box borderTop="1px solid" borderColor={borderColor} pt="12px">
              <Flex justify="space-between" fontSize="xs" color="gray.500">
                <Text>Last active</Text>
                <Text>{timeAgo(member.lastActiveAt)}</Text>
              </Flex>
            </Box>
          </Card>
        ))}
      </SimpleGrid>

      {/* Invite Modal */}
      <Modal isOpen={isInviteOpen} onClose={onInviteClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Invite Team Member</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <FormControl mb="16px">
              <FormLabel>Email Address</FormLabel>
              <Input
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </FormControl>
            <FormControl>
              <FormLabel>Role</FormLabel>
              <Select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </Select>
            </FormControl>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onInviteClose}>
              Cancel
            </Button>
            <Button variant="brand" onClick={handleInvite} isLoading={inviting}>
              Send Invitation
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
