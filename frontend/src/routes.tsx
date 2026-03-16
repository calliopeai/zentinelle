import { Icon } from '@chakra-ui/react';
import {
  MdSmartToy,
  MdMonitorHeart,
  MdPolicy,
  MdChat,
  MdMemory,
  MdVerifiedUser,
  MdWarning,
  MdHistory,
  MdSecurity,

  MdStorage,
  MdBarChart,

  MdSettings,

  MdKey,
  MdAccountTree,
} from 'react-icons/md';

import { IRoute } from 'types/navigation';

const routes: IRoute[] = [
  {
    name: 'Agents',
    path: '/agents',
    icon: <Icon as={MdSmartToy} width="20px" height="20px" color="inherit" />,
  },
  {
    name: 'Monitoring',
    path: '/monitoring',
    icon: <Icon as={MdMonitorHeart} width="20px" height="20px" color="inherit" />,
  },
  {
    name: 'Policies',
    path: '/policies',
    icon: <Icon as={MdPolicy} width="20px" height="20px" color="inherit" />,
  },
  {
    name: 'Prompts',
    path: '/prompts',
    icon: <Icon as={MdChat} width="20px" height="20px" color="inherit" />,
  },
  {
    name: 'Models',
    path: '/models',
    icon: <Icon as={MdMemory} width="20px" height="20px" color="inherit" />,
  },
  {
    name: 'Compliance',
    path: '/compliance',
    icon: <Icon as={MdVerifiedUser} width="20px" height="20px" color="inherit" />,
  },
  {
    name: 'Risk',
    path: '/risk',
    icon: <Icon as={MdWarning} width="20px" height="20px" color="inherit" />,
  },
  {
    name: 'Policy Graph',
    path: '/graph',
    icon: <Icon as={MdAccountTree} width="20px" height="20px" color="inherit" />,
  },
  {
    name: 'Audit Logs',
    path: '/audit-logs',
    icon: <Icon as={MdHistory} width="20px" height="20px" color="inherit" />,
  },
  {
    name: 'Network',
    path: '/network',
    icon: <Icon as={MdSecurity} width="20px" height="20px" color="inherit" />,
  },
  {
    name: 'Retention',
    path: '/retention',
    icon: <Icon as={MdStorage} width="20px" height="20px" color="inherit" />,
  },
  {
    name: 'Usage',
    path: '/usage',
    icon: <Icon as={MdBarChart} width="20px" height="20px" color="inherit" />,
  },
  {
    name: 'API Keys',
    path: '/settings/api-keys',
    icon: <Icon as={MdKey} width="20px" height="20px" color="inherit" />,
  },
  {
    name: 'Settings',
    path: '/settings',
    icon: <Icon as={MdSettings} width="20px" height="20px" color="inherit" />,
  },
];

export default routes;
