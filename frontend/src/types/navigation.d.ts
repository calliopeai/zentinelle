import { ReactNode } from 'react';

export interface IRoute {
  name: string;
  layout?: string;
  path: string;
  icon?: ReactNode;
  secondary?: boolean;
  collapse?: boolean;
  items?: IRoute[];
}
