'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface PageHeader {
  title: string;
  description?: string;
}

const PageHeaderContext = createContext<{
  header: PageHeader;
  setHeader: (h: PageHeader) => void;
}>({
  header: { title: '' },
  setHeader: () => {},
});

export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const [header, setHeader] = useState<PageHeader>({ title: '' });
  return (
    <PageHeaderContext.Provider value={{ header, setHeader }}>
      {children}
    </PageHeaderContext.Provider>
  );
}

export function usePageHeader(title: string, description?: string) {
  const { setHeader } = useContext(PageHeaderContext);
  useEffect(() => {
    setHeader({ title, description });
    return () => setHeader({ title: '', description: undefined });
  }, [title, description, setHeader]);
}

export function useCurrentPageHeader() {
  return useContext(PageHeaderContext).header;
}
