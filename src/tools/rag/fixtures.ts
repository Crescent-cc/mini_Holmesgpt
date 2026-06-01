export type LogEntry = {
  timestamp: string;
  service: string;
  level: string;
  message: string;
  requestId?: string;
  traceId?: string;
};

export type GatewayRoute = {
  id: string;
  path: string;
  target: string;
  methods?: string[];
};

export type SpringRoute = {
  method: string;
  path: string;
  handler: string;
  source?: string;
};

export type CodeReference = {
  path: string;
  line: number;
  symbol?: string;
  snippet: string;
};

export type VectorHit = {
  documentId: string;
  chunkId: string;
  score: number;
  text: string;
  source?: string;
  metadata?: Record<string, unknown>;
};

export type VectorSearchRecord = {
  query: string;
  knowledgeBaseIds?: number[];
  topK?: number;
  minScore?: number;
  hits: VectorHit[];
};

export type RagTrace = {
  id: string;
  requestId?: string;
  sessionId?: string | number;
  question: string;
  rewrittenQuery?: string;
  knowledgeBaseIds?: number[];
  searchParams?: {
    topK?: number;
    minScore?: number;
  };
  vectorHits: VectorHit[];
  promptContext?: string;
  answer?: string;
  citations?: string[];
  failureLabel?: string;
};

export type RagDiagnosticFixture = {
  id: string;
  name: string;
  logs?: LogEntry[];
  gatewayRoutes?: GatewayRoute[];
  springRoutes?: SpringRoute[];
  codeReferences?: CodeReference[];
  ragTraces?: RagTrace[];
  vectorSearches?: VectorSearchRecord[];
};

export type DiagnosticToolResponse<T> = {
  fixtureId: string;
  summary: string;
  count: number;
  items: T[];
};
