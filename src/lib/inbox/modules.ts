export const INBOX_MODULE_KEYS = [
  "portfolio",
  "units",
  "stays",
  "guests",
  "readers",
] as const;

export type InboxModuleKey = (typeof INBOX_MODULE_KEYS)[number];

export type InboxModules = Record<InboxModuleKey, boolean>;

export const DEFAULT_INBOX_MODULES: InboxModules = {
  portfolio: true,
  units: true,
  stays: true,
  guests: true,
  readers: false,
};

export function parseInboxModules(raw: unknown): InboxModules {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_INBOX_MODULES };
  const input = raw as Record<string, unknown>;
  return {
    portfolio: input.portfolio !== false,
    units: input.units !== false,
    stays: input.stays !== false,
    guests: input.guests !== false,
    readers: input.readers === true,
  };
}

export function inboxModulesForSave(input: Partial<InboxModules> | undefined): InboxModules {
  return parseInboxModules(input);
}

export function hasAnyInboxModule(modules: InboxModules): boolean {
  return INBOX_MODULE_KEYS.some((key) => modules[key]);
}
