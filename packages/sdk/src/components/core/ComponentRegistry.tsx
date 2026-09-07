import React, { createContext, useContext } from 'react';

export interface ComponentRegistryContextValue {
  registry: Record<string, React.ComponentType<any>>;
  register: (name: string, component: React.ComponentType<any>) => void;
}

const ComponentRegistryContext = createContext<ComponentRegistryContextValue | null>(null);

export function ComponentRegistryProvider({
  components,
  children,
}: {
  components: Record<string, React.ComponentType<any>>;
  children: React.ReactNode;
}): React.ReactElement {
  const [registeredComponents, setRegisteredComponents] = React.useState<
    Record<string, React.ComponentType<any>>
  >({});

  const register = React.useCallback((name: string, component: React.ComponentType<any>) => {
    setRegisteredComponents((prev) => ({ ...prev, [name]: component }));
  }, []);

  const registry = React.useMemo(
    () => ({ ...components, ...registeredComponents }),
    [components, registeredComponents],
  );
  const value = React.useMemo(() => ({ registry, register }), [registry, register]);

  return React.createElement(ComponentRegistryContext.Provider, { value }, children);
}

export function useComponent(componentName: string): React.ComponentType<any> | null {
  const context = useContext(ComponentRegistryContext);
  if (!context) {
    return null;
  }
  return context.registry[componentName] || null;
}

export { ComponentRegistryContext };
