import { IRoute } from 'types/navigation';

export const isWindowAvailable = () => typeof window !== 'undefined';

export const findCurrentRoute = (routes: IRoute[], pathname: string): IRoute | undefined => {
  for (const route of routes) {
    if (route.items) {
      const found = findCurrentRoute(route.items, pathname);
      if (found) return found;
    }
    if (route.path && !route.collapse) {
      if (pathname === route.path || pathname.startsWith(route.path + '/')) {
        return route;
      }
    }
  }
  return undefined;
};

export const findParentRoute = (routes: IRoute[], pathname: string): IRoute | undefined => {
  for (const route of routes) {
    if (route.items) {
      const found = findCurrentRoute(route.items, pathname);
      if (found) return route;
    }
  }
  return undefined;
};

export const getActiveRoute = (routes: IRoute[], pathname: string): string => {
  const route = findCurrentRoute(routes, pathname);
  return route?.name || 'Zentinelle';
};

export const getActiveParent = (routes: IRoute[], pathname: string): string | undefined => {
  const parent = findParentRoute(routes, pathname);
  return parent?.name;
};

export const getActiveNavbar = (routes: IRoute[], pathname: string): boolean => {
  const route = findCurrentRoute(routes, pathname);
  return route?.secondary || false;
};
