export type TerminalChromeSignature =
  | null
  | boolean
  | number
  | string
  | TerminalChromeSignature[]
  | { [key: string]: TerminalChromeSignature | undefined };

type RenderTerminalChromeRequest<TActions extends object> = {
  tabId: string;
  mountedTerminal: object;
  signature: TerminalChromeSignature;
  actions: TActions;
  renderStatusBar: (actions: TActions) => void;
  renderGroupRail: (actions: TActions) => void;
  renderFloatingMenu: (actions: TActions) => void;
};

type TerminalChromeRenderResult<TActions extends object> = {
  rendered: boolean;
  actions: TActions;
};

type CacheEntry<TActions extends object> = {
  mountedTerminal: object;
  signature: string;
  currentActions: TActions;
  stableActions: TActions;
};

function createStableObjectProxy<TActions extends object>(
  resolveCurrent: () => TActions
): TActions {
  const nestedProxies = new Map<PropertyKey, object>();
  return new Proxy({} as TActions, {
    get: (_target, property) => {
      const value = Reflect.get(resolveCurrent(), property);
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return value;
      }
      let nestedProxy = nestedProxies.get(property);
      if (!nestedProxy) {
        nestedProxy = createStableObjectProxy(() =>
          Reflect.get(resolveCurrent(), property)
        );
        nestedProxies.set(property, nestedProxy);
      }
      return nestedProxy;
    },
    has: (_target, property) => Reflect.has(resolveCurrent(), property),
    ownKeys: () => Reflect.ownKeys(resolveCurrent()),
    getOwnPropertyDescriptor: (_target, property) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(resolveCurrent(), property);
      return descriptor ? { ...descriptor, configurable: true } : undefined;
    }
  });
}

function createEntry<TActions extends object>(
  mountedTerminal: object,
  signature: string,
  actions: TActions
): CacheEntry<TActions> {
  const entry = {
    mountedTerminal,
    signature,
    currentActions: actions
  } as CacheEntry<TActions>;
  entry.stableActions = createStableObjectProxy(() => entry.currentActions);
  return entry;
}

export function createTerminalChromeRenderCache<TActions extends object>() {
  const entries = new Map<string, CacheEntry<TActions>>();

  return {
    render(
      request: RenderTerminalChromeRequest<TActions>
    ): TerminalChromeRenderResult<TActions> {
      const signature = JSON.stringify(request.signature);
      let entry = entries.get(request.tabId);

      if (!entry || entry.mountedTerminal !== request.mountedTerminal) {
        entry = createEntry(
          request.mountedTerminal,
          signature,
          request.actions
        );
        entries.set(request.tabId, entry);
      } else {
        entry.currentActions = request.actions;
        if (entry.signature === signature) {
          return { rendered: false, actions: entry.stableActions };
        }
        entry.signature = signature;
      }

      request.renderStatusBar(entry.stableActions);
      request.renderGroupRail(entry.stableActions);
      request.renderFloatingMenu(entry.stableActions);
      return { rendered: true, actions: entry.stableActions };
    },
    delete(tabId: string) {
      entries.delete(tabId);
    },
    clear() {
      entries.clear();
    }
  };
}
