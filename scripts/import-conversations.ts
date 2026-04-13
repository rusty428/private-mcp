// scripts/import-conversations.ts
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { parseArgs } from 'node:util';
import { parseClaudeCode, parseChatGPT } from './lib/normalizer';
import { chunkConversation } from './lib/chunker';
import { ImportManifest } from './lib/importManifest';
import { NormalizedConversation, Chunk, ConversationFormat, ImportOptions } from './lib/types';

// --- Arg Parsing ---

const { values } = parseArgs({
  options: {
    source: { type: 'string', short: 's' },
    format: { type: 'string', short: 'f', default: 'auto' },
    project: { type: 'string', short: 'p' },
    endpoint: { type: 'string' },
    'api-key': { type: 'string' },
    since: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    limit: { type: 'string' },
    rate: { type: 'string', default: '5' },
    'user-id': { type: 'string', default: 'owner' },
    'team-id': { type: 'string', default: 'default' },
    'manifest-path': { type: 'string' },
  },
  strict: true,
});

if (!values.source) {
  console.error('Usage: npx ts-node scripts/import-conversations.ts --source <dir> [options]');
  console.error('\nRequired:');
  console.error('  --source, -s     Directory containing conversation files');
  console.error('\nOptions:');
  console.error('  --format, -f     Force format: claude-code, chatgpt, claude-ai, auto (default: auto)');
  console.error('  --project, -p    Override project name for all imports');
  console.error('  --endpoint       API endpoint URL (or set PRIVATE_MCP_ENDPOINT)');
  console.error('  --api-key        API key (or set PRIVATE_MCP_API_KEY)');
  console.error('  --since          Only import files modified after YYYY-MM-DD');
  console.error('  --dry-run        Count files and chunks without importing');
  console.error('  --limit          Maximum number of files to process');
  console.error('  --rate           Requests per second (default: 5)');
  console.error('  --user-id        User ID to stamp (default: owner)');
  console.error('  --team-id        Team ID to stamp (default: default)');
  console.error('  --manifest-path  Path to import manifest JSON (default: ~/.private-mcp/import-manifest.json)');
  process.exit(1);
}

const options: ImportOptions = {
  source: values.source!,
  format: (values.format as ConversationFormat | 'auto') || 'auto',
  project: values.project,
  since: values.since,
  dryRun: values['dry-run'] || false,
  limit: values.limit ? parseInt(values.limit, 10) : undefined,
  rate: parseInt(values.rate || '5', 10),
  userId: values['user-id'] || 'owner',
  teamId: values['team-id'] || 'default',
  endpoint: values.endpoint || process.env.PRIVATE_MCP_ENDPOINT || '',
  apiKey: values['api-key'] || process.env.PRIVATE_MCP_API_KEY || '',
  manifestPath:
    values['manifest-path'] ||
    path.join(
      process.env.HOME || '~',
      '.private-mcp',
      'import-manifest.json',
    ),
};

// --- File Discovery ---

function discoverFiles(source: string, format: ConversationFormat | 'auto'): string[] {
  const files: string[] = [];
  const stat = fs.statSync(source);

  if (stat.isFile()) {
    files.push(source);
    return files;
  }

  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'memory' || entry.name.startsWith('.')) continue;
        walk(fullPath);
      } else if (entry.isFile()) {
        if (format === 'claude-code' || format === 'auto') {
          if (entry.name.endsWith('.jsonl')) files.push(fullPath);
        }
        if (format === 'chatgpt' || format === 'auto') {
          if (entry.name === 'conversations.json') files.push(fullPath);
        }
        if (format === 'claude-ai' || format === 'auto') {
          if (entry.name.endsWith('.json') && entry.name !== 'conversations.json') {
            files.push(fullPath);
          }
        }
      }
    }
  }

  walk(source);
  return files.sort();
}

function fileHash(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(content).digest('hex').slice(0, 16);
}

function sourceRefForChunk(
  format: string,
  filePath: string,
  chunkIndex: number,
  content: string,
): string {
  const contentHash = crypto
    .createHash('md5')
    .update(content)
    .digest('hex')
    .slice(0, 16);
  const filename = path.basename(filePath);
  return `${format}:${filename}:${chunkIndex}:${contentHash}`;
}

// --- Normalizer Dispatch ---

function normalizeFile(
  content: string,
  filePath: string,
  format: ConversationFormat | 'auto',
): NormalizedConversation[] {
  if (format === 'claude-code') return parseClaudeCode(content, filePath);
  if (format === 'chatgpt') return parseChatGPT(content, filePath);

  // Auto-detection
  if (format === 'auto') {
    if (filePath.endsWith('.jsonl')) return parseClaudeCode(content, filePath);
    if (path.basename(filePath) === 'conversations.json') {
      return parseChatGPT(content, filePath);
    }
  }

  console.warn(`  Skipping ${filePath} — format not yet supported`);
  return [];
}

// --- REST API Capture ---

async function captureChunk(
  chunk: Chunk,
  conversation: NormalizedConversation,
  opts: ImportOptions,
): Promise<void> {
  const body = {
    text: chunk.content,
    source: `import-${conversation.format}`,
    sourceRef: sourceRefForChunk(
      conversation.format,
      conversation.sourceFile,
      chunk.chunkIndex,
      chunk.content,
    ),
    project: opts.project || conversation.project || '',
    session_id: conversation.sessionId || '',
    session_name: conversation.sessionName || '',
    thought_date: conversation.sessionDate,
    created_at: conversation.sessionDate
      ? `${conversation.sessionDate}T00:00:00.000Z`
      : undefined,
  };

  const response = await fetch(`${opts.endpoint}/api/capture`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': opts.apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }

  await response.body?.cancel();
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Main ---

async function main(): Promise<void> {
  console.log('Conversation Import Tool');
  console.log('========================');
  console.log(`Source:    ${options.source}`);
  console.log(`Format:   ${options.format}`);
  console.log(`Dry run:  ${options.dryRun}`);
  if (options.project) console.log(`Project:  ${options.project}`);
  if (options.since) console.log(`Since:    ${options.since}`);
  if (options.limit) console.log(`Limit:    ${options.limit} files`);
  console.log(`Rate:     ${options.rate} rps`);
  console.log('');

  // Validate endpoint and API key for live import
  if (!options.dryRun) {
    if (!options.endpoint) {
      console.error('Error: --endpoint or PRIVATE_MCP_ENDPOINT is required for live import');
      process.exit(1);
    }
    if (!options.apiKey) {
      console.error('Error: --api-key or PRIVATE_MCP_API_KEY is required for live import');
      process.exit(1);
    }
    console.log(`Endpoint: ${options.endpoint}`);
    console.log('');
  }

  // Discover files
  let files = discoverFiles(options.source, options.format);
  console.log(`Found ${files.length} conversation files`);

  // Date filter
  if (options.since) {
    const sinceDate = new Date(options.since);
    files = files.filter(f => {
      const stat = fs.statSync(f);
      return stat.mtime >= sinceDate;
    });
    console.log(`After date filter: ${files.length} files`);
  }

  // Limit
  if (options.limit && files.length > options.limit) {
    files = files.slice(0, options.limit);
    console.log(`Limited to ${files.length} files`);
  }

  // Load manifest
  const manifest = ImportManifest.load(options.manifestPath);
  const skipped: string[] = [];
  const toProcess: string[] = [];

  for (const file of files) {
    if (manifest.hasFile(file)) {
      skipped.push(file);
    } else {
      toProcess.push(file);
    }
  }

  if (skipped.length > 0) {
    console.log(`Skipping ${skipped.length} already-imported files`);
  }
  console.log(`Files to process: ${toProcess.length}`);
  console.log('');

  // Process files
  let totalChunks = 0;
  let totalImported = 0;
  let totalErrors = 0;
  const rateDelayMs = Math.ceil(1000 / options.rate);

  for (let fileIdx = 0; fileIdx < toProcess.length; fileIdx++) {
    const filePath = toProcess[fileIdx];
    const content = fs.readFileSync(filePath, 'utf-8');
    const conversations = normalizeFile(content, filePath, options.format);

    let fileChunks = 0;
    for (const conv of conversations) {
      const chunks = chunkConversation(conv);
      fileChunks += chunks.length;
      totalChunks += chunks.length;

      if (!options.dryRun) {
        for (const chunk of chunks) {
          try {
            await captureChunk(chunk, conv, options);
            totalImported++;
            if (totalImported % 10 === 0) {
              process.stdout.write(
                `\r  [${fileIdx + 1}/${toProcess.length}] ${totalImported} chunks imported...`,
              );
            }
          } catch (err: any) {
            totalErrors++;
            console.error(`\n  Error: ${err.message}`);
            await sleep(rateDelayMs * 4);
          }
          await sleep(rateDelayMs);
        }
      }
    }

    const label = conversations[0]?.sessionName || path.basename(filePath);
    console.log(
      `[${fileIdx + 1}/${toProcess.length}] ${label} (${fileChunks} chunks)`,
    );

    if (!options.dryRun) {
      manifest.markFile(filePath, fileHash(filePath), fileChunks);
      manifest.save();
    }
  }

  // Summary
  console.log('');
  console.log('Summary');
  console.log('-------');
  console.log(`Files processed:   ${toProcess.length}`);
  console.log(`Files skipped:     ${skipped.length}`);
  console.log(`Total chunks:      ${totalChunks}`);
  if (!options.dryRun) {
    console.log(`Chunks imported:   ${totalImported}`);
    console.log(`Errors:            ${totalErrors}`);
  }
  if (options.dryRun) {
    console.log('');
    console.log('(dry run — no data was imported)');
  }
}

main().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
