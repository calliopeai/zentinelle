import { createContext } from 'react';

export const ConfiguratorContext = createContext<{
  mini: boolean;
  setMini: React.Dispatch<React.SetStateAction<boolean>>;
  hovered: boolean;
  setHovered: React.Dispatch<React.SetStateAction<boolean>>;
  contrast: boolean;
  setContrast: React.Dispatch<React.SetStateAction<boolean>>;
  theme: any;
  setTheme: React.Dispatch<React.SetStateAction<any>>;
}>({
  mini: false,
  setMini: () => {},
  hovered: false,
  setHovered: () => {},
  contrast: false,
  setContrast: () => {},
  theme: null,
  setTheme: () => {},
});
