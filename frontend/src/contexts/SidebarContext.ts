import { createContext } from 'react';

export const SidebarContext = createContext<{
  toggleSidebar: () => void;
  setToggleSidebar: React.Dispatch<React.SetStateAction<() => void>>;
}>({
  toggleSidebar: () => {},
  setToggleSidebar: () => {},
});
