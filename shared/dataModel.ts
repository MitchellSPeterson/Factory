import type { AgentProvider } from "./agentModel";
import type { OperationResult, OperationState, ProjectOperation } from "./projectOperations";
import type { TokenUsage } from "./tokenUsage";
import type {
  AgentEffort,
  PermissionMode,
  ProjectKind,
  Runtime,
  ServiceTier,
  SessionItemKind,
  SessionItemStatus,
  SessionProvider,
  SessionStatus,
} from "./validators";

export type Id<Table extends string = string> = string & { readonly __table?: Table };

export type RepoSkill = { slug: string; title: string; description: string };

export type ProviderWindow = {
  name: string;
  percentUsed: number;
  resetsAt?: number;
  windowSeconds?: number;
};

export type ProviderMeter = {
  provider: AgentProvider;
  status: "ok" | "error" | "signed_out";
  message?: string;
  display?: string;
  plan?: string;
  windows?: ProviderWindow[];
  remainingCents?: number;
  limitCents?: number;
  usedCents?: number;
  percentUsed?: number;
  resetsAt?: number;
};

export type ProviderUsage = {
  checkedAt: number;
  meters: ProviderMeter[];
};

export type SimDevice = {
  udid: string;
  name: string;
  state: string;
  runtime?: string;
  streamUrl?: string;
  wsUrl?: string;
};

export type SimHub = {
  supported?: boolean;
  message?: string;
  devices: SimDevice[];
};

export type Tables = {
  projects: {
    name: string;
    kind: ProjectKind | string;
    localPath: string;
    githubRepo: string;
    defaultRuntime: Runtime | string;
    serverId?: string;
    cloneStatus?: string;
    cloneError?: string;
    usage?: TokenUsage;
    skills?: RepoSkill[];
  };
  sessions: {
    projectId: Id<"projects">;
    title: string;
    provider: SessionProvider;
    model: string;
    effort: AgentEffort;
    permissionMode?: PermissionMode;
    serviceTier?: ServiceTier;
    status: SessionStatus | string;
    error?: string;
  };
  sessionMessages: {
    sessionId: Id<"sessions">;
    role: string;
    text: string;
    imageIds?: string[];
    imageUrls?: Array<string | null>;
    skillSlugs?: string[];
    kind?: SessionItemKind;
    status?: SessionItemStatus | string;
    title?: string;
    detail?: string;
    decision?: string;
    requestId?: string;
    options?: Array<{ optionId: string; name: string; kind?: string }>;
  };
  servers: {
    accessKey: string;
    name: string;
    publicKey: string;
    projectsRoot: string;
    lastSeen: number;
    grokCatalog?: unknown;
    providerUsage?: ProviderUsage;
    simHubWanted?: boolean;
    simHub?: SimHub;
    pty?: { url: string; os?: string; checkedAt?: number };
  };
  terminals: {
    projectId: Id<"projects">;
    serverId?: string;
    title: string;
    state: string;
    leaseUntil: number;
    cols: number;
    rows: number;
    message?: string;
  };
  projectOperations: {
    projectId: Id<"projects">;
    operation: ProjectOperation;
    state: OperationState;
    output?: string;
    result?: OperationResult;
    error?: string;
  };
  skills: {
    slug: string;
    title: string;
    body?: string;
    description?: string;
    sourceHint?: string;
    sourceKind?: string;
  };
};

export type Doc<Table extends keyof Tables = keyof Tables> = {
  _id: Id<Table>;
  _creationTime: number;
} & Tables[Table];

export type ServerView = {
  id: string;
  name: string;
  publicKey: string;
  projectsRoot: string;
  lastSeen: number;
  grokCatalog?: unknown;
  providerUsage?: ProviderUsage;
  simHubWanted?: boolean;
  simHub?: SimHub;
};

export type SessionListRow = {
  session: Doc<"sessions">;
  projectName: string;
};

export type SessionView = {
  session: Doc<"sessions">;
  project: {
    _id: Id<"projects">;
    name: string;
    kind: string;
    localPath: string;
    githubRepo: string;
  };
  messages: Array<Doc<"sessionMessages">>;
};

export type GithubConnection = { login: string; token: string };

export type SkillCatalogRow = {
  _id: Id<"skills">;
  slug: string;
  title: string;
  description: string;
};

export type PtyTicket = {
  wsUrl: string;
  ticket: string;
  expiresAt: number;
  hostOs?: string;
};

export type SessionLaunch = {
  sessionId: Id<"sessions">;
  prompt: string;
  provider: SessionProvider | string;
  model: string;
  effort: AgentEffort | string;
  permissionMode: PermissionMode;
  serviceTier: ServiceTier;
  agentId?: string;
  images: Array<{ url: string }>;
  project: {
    id: Id<"projects">;
    serverId?: string;
    name: string;
    kind: string;
    localPath: string;
    githubRepo: string;
  };
};

export type ImportTask = {
  _id: string;
  projectId: Id<"projects">;
  repo: string;
  sealedToken?: string;
  attempt: number;
  status: string;
};

export type EnvRow = { name: string; sealed: string; scope: string };

export type DeviceCommand =
  | { kind: "boot"; udid: string }
  | { kind: "shutdown"; udid: string }
  | { kind: "button"; udid: string; name: "home" };

export type DeviceCommandWork = {
  wanted: boolean;
  commands: Array<{ commandId: string; command: DeviceCommand }>;
};

export type TerminalClaim = Doc<"terminals"> & { localPath: string };

export type TerminalExchange = {
  input: string;
  inputEnd: number;
  cols: number;
  rows: number;
};

export type OperationClaim = Doc<"projectOperations"> & { localPath: string };

export type PermissionDecision =
  | { status: "pending" }
  | { status: "denied"; optionId?: string }
  | { status: "resolved"; optionId?: string };
