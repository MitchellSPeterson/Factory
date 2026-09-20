import type {
  DeviceCommandWork,
  Doc,
  EnvRow,
  GithubConnection,
  Id,
  ImportTask,
  OperationClaim,
  PermissionDecision,
  PtyTicket,
  ServerView,
  SessionLaunch,
  SessionListRow,
  SessionView,
  SkillCatalogRow,
  TerminalClaim,
  TerminalExchange,
} from "./dataModel";
import type { ProjectOperation } from "./projectOperations";
import type { AgentEffort, PermissionMode, ProjectKind, ServiceTier, SessionProvider } from "./validators";

export type ApiFn<Args extends object = object, Result = unknown> = string & {
  readonly _args: Args;
  readonly _result: Result;
};

function ref<Args extends object, Result>(path: string): ApiFn<Args, Result> {
  return path as ApiFn<Args, Result>;
}

type Empty = Record<string, never>;

export const api = {
  sessions: {
    list: ref<Empty, SessionListRow[]>("sessions.list"),
    get: ref<{ sessionId: string }, SessionView | null>("sessions.get"),
    create: ref<
      {
        projectId: string;
        provider: SessionProvider;
        model: string;
        effort: AgentEffort;
        permissionMode?: PermissionMode;
        serviceTier?: ServiceTier;
        text: string;
        imageIds?: string[];
        skillSlugs?: string[];
        accessKey?: string;
      },
      Id<"sessions">
    >("sessions.create"),
    generateUploadUrl: ref<Empty, string>("sessions.generateUploadUrl"),
    configure: ref<
      {
        sessionId: string;
        provider?: SessionProvider;
        model?: string;
        effort?: AgentEffort;
        permissionMode?: PermissionMode;
        serviceTier?: ServiceTier;
      },
      null
    >("sessions.configure"),
    send: ref<
      { sessionId: string; text: string; imageIds?: string[]; skillSlugs?: string[] },
      null
    >("sessions.send"),
    stop: ref<{ sessionId: string }, null>("sessions.stop"),
    remove: ref<{ sessionId: string }, null>("sessions.remove"),
    listQueued: ref<Empty, string[]>("sessions.listQueued"),
    claim: ref<{ sessionId: string; accessKey: string }, SessionLaunch | null>("sessions.claim"),
    bindAgent: ref<object, null>("sessions.bindAgent"),
    appendMessage: ref<object, string>("sessions.appendMessage"),
    upsertItem: ref<object, string>("sessions.upsertItem"),
    resolvePermission: ref<object, null>("sessions.resolvePermission"),
    getPermission: ref<{ sessionId: string; requestId: string }, PermissionDecision | null>("sessions.getPermission"),
    recordUsage: ref<object, null>("sessions.recordUsage"),
    complete: ref<object, null>("sessions.complete"),
    fail: ref<{ sessionId: string; error: string }, null>("sessions.fail"),
    getStatus: ref<{ sessionId: string }, string | null>("sessions.getStatus"),
  },
  projects: {
    list: ref<Empty, Doc<"projects">[]>("projects.list"),
    get: ref<{ projectId: string }, Doc<"projects"> | null>("projects.get"),
    create: ref<
      {
        name: string;
        kind: ProjectKind | "web" | "expo" | "mixed";
        localPath: string;
        githubRepo: string;
        defaultRuntime: "local";
      },
      Id<"projects">
    >("projects.create"),
    update: ref<object, null>("projects.update"),
    remove: ref<object, null>("projects.remove"),
    reportSkills: ref<object, null>("projects.reportSkills"),
  },
  servers: {
    register: ref<object, string>("servers.register"),
    paired: ref<{ accessKey: string }, ServerView>("servers.paired"),
    local: ref<Empty, ServerView | null>("servers.local"),
    reportGrokCatalog: ref<object, null>("servers.reportGrokCatalog"),
    reportProviderUsage: ref<object, null>("servers.reportProviderUsage"),
    heartbeat: ref<{ accessKey: string }, null>("servers.heartbeat"),
    reportSimHub: ref<object, null>("servers.reportSimHub"),
    setSimHubWanted: ref<{ wanted: boolean; accessKey?: string }, null>("servers.setSimHubWanted"),
    enqueueDeviceCommand: ref<{ command: object; accessKey?: string }, string>("servers.enqueueDeviceCommand"),
    claimDeviceCommands: ref<{ accessKey: string }, DeviceCommandWork>("servers.claimDeviceCommands"),
    finishDeviceCommand: ref<object, null>("servers.finishDeviceCommand"),
    variables: ref<object, unknown>("servers.variables"),
    setVariable: ref<{ scope: string; name: string; sealed: string }, null>("servers.setVariable"),
    removeVariable: ref<object, null>("servers.removeVariable"),
    readEnvironment: ref<{ accessKey: string; projectId?: string }, EnvRow[]>("servers.readEnvironment"),
    importRepository: ref<
      { repo: string; name: string; kind: "web"; sealedToken: string; accessKey?: string },
      Id<"projects">
    >("servers.importRepository"),
    retryImport: ref<object, null>("servers.retryImport"),
    claimImport: ref<{ accessKey: string }, ImportTask | null>("servers.claimImport"),
    finishImport: ref<
      { accessKey: string; importId: string; attempt: number; localPath?: string; error?: string },
      null
    >("servers.finishImport"),
  },
  terminals: {
    list: ref<{ projectId: string }, Doc<"terminals">[]>("terminals.list"),
    output: ref<{ id: string }, { output: string; outputEnd: number } | null>("terminals.output"),
    create: ref<{ projectId: string }, Id<"terminals">>("terminals.create"),
    close: ref<{ id: string }, null>("terminals.close"),
    input: ref<object, null>("terminals.input"),
    resize: ref<object, null>("terminals.resize"),
    claim: ref<{ accessKey: string; owner: string }, TerminalClaim[]>("terminals.claim"),
    exchange: ref<
      {
        accessKey: string;
        owner: string;
        id: string;
        inputAck: number;
        output?: string;
        outputEnd?: number;
        exit?: string | number;
      },
      TerminalExchange | null
    >("terminals.exchange"),
  },
  projectOperations: {
    list: ref<{ projectId: string }, Doc<"projectOperations">[]>("projectOperations.list"),
    enqueue: ref<{ projectId: string; operation: ProjectOperation }, Id<"projectOperations">>("projectOperations.enqueue"),
    cancel: ref<{ id: string }, null>("projectOperations.cancel"),
    claim: ref<{ accessKey: string }, OperationClaim | null>("projectOperations.claim"),
    update: ref<{ accessKey: string; id: string; output?: string; result?: unknown; error?: string }, boolean>(
      "projectOperations.update",
    ),
  },
  github: {
    connection: ref<Empty, GithubConnection | null>("github.connection"),
    save: ref<{ login: string; token: string }, null>("github.save"),
    disconnect: ref<Empty, null>("github.disconnect"),
    begin: ref<{ clientId: string }, { deviceCode: string; userCode: string; expiresIn: number; interval: number }>(
      "github.begin",
    ),
    poll: ref<
      { clientId: string; deviceCode: string },
      { status: "pending" | "connected" | "slow_down"; token?: string }
    >("github.poll"),
  },
  pty: {
    issueTicket: ref<{ projectId: string }, PtyTicket>("pty.issueTicket"),
    validateTicket: ref<{ accessKey: string; ticket: string }, { projectId: string; cwd: string }>("pty.validateTicket"),
    reportPty: ref<object, null>("pty.reportPty"),
  },
  skills: {
    list: ref<Empty, Doc<"skills">[]>("skills.list"),
    catalog: ref<Empty, SkillCatalogRow[]>("skills.catalog"),
    create: ref<object, string>("skills.create"),
    get: ref<{ skillId: string }, Doc<"skills"> | null>("skills.get"),
    update: ref<object, null>("skills.update"),
  },
  seed: {
    ensure: ref<object, { createdSkills: number }>("seed.ensure"),
    featureReady: ref<Empty, boolean>("seed.featureReady"),
  },
};

export type ApiRef = string;
