// scripts/lib/types.ts

export interface NormalizedMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface NormalizedConversation {
  messages: NormalizedMessage[];
  sourceFile: string;
  format: ConversationFormat;
  sessionDate?: string;    // YYYY-MM-DD from file metadata
  sessionId?: string;      // Claude Code session UUID
  sessionName?: string;    // Claude Code /rename title
  project?: string;        // Inferred from cwd, channel, etc.
}

export interface Chunk {
  content: string;         // User turn + assistant response combined
  chunkIndex: number;      // Position within the conversation
  userTurn: string;        // Just the user's message
}

export type ConversationFormat = 'claude-code' | 'chatgpt' | 'claude-ai';

export interface ImportManifestData {
  importedFiles: Record<string, ImportedFileEntry>;
}

export interface ImportedFileEntry {
  fileHash: string;
  chunksImported: number;
  importedAt: string;      // ISO 8601
}

export interface ImportOptions {
  source: string;          // Directory path to scan
  format: ConversationFormat | 'auto';
  project?: string;        // Override project for all imports
  since?: string;          // YYYY-MM-DD — skip files older than this
  dryRun: boolean;
  limit?: number;          // Max files to process
  rate: number;            // Requests per second (default 5)
  userId: string;          // user_id to stamp (default 'owner')
  teamId: string;          // team_id to stamp (default 'default')
  endpoint: string;        // REST API endpoint URL
  apiKey: string;          // API key for x-api-key header
  manifestPath: string;    // Path to import manifest JSON
}
