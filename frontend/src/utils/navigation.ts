import { IRoute } from 'types/navigation';

export const isWindowAvailable = () => typeof window !== 'undefined';

export const findCurrentRoute = (routes: IRoute[], pathname: string): IRoute | undefined => {
  for (const route of routes) {
    if (route.items) {
      const found = findCurrentRoute(route.items, pathname);
      if (found) return found;
    }
    if (route.layout && route.path) {
      const fullPath = `${route.layout}${route.path}`;
      if (pathname === fullPath || pathname.startsWith(fullPath + '/')) {
        return route;
      }
    }
  }
  return undefined;
};

export const getActiveRoute = (routes: IRoute[], pathname: string): string => {
  const route = findCurrentRoute(routes, pathname);
  return route?.name || 'Zentinelle';
};

export const getActiveNavbar = (routes: IRoute[], pathname: string): boolean => {
  const route = findCurrentRoute(routes, pathname);
  return route?.secondary || false;
};
