import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ImportManifest } from '../importManifest';

describe('ImportManifest', () => {
  let manifestPath: string;

  beforeEach(() => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'import-test-'));
    manifestPath = path.join(tmpDir, 'manifest.json');
  });

  afterEach(() => {
    const dir = path.dirname(manifestPath);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true });
    }
  });

  it('creates a new manifest when file does not exist', () => {
    const manifest = ImportManifest.load(manifestPath);
    expect(manifest.hasFile('/path/to/file.jsonl')).toBe(false);
  });

  it('marks a file as imported and persists', () => {
    const manifest = ImportManifest.load(manifestPath);
    manifest.markFile('/path/to/file.jsonl', 'abc123', 5);
    manifest.save();

    // Reload from disk
    const reloaded = ImportManifest.load(manifestPath);
    expect(reloaded.hasFile('/path/to/file.jsonl')).toBe(true);
  });

  it('returns false for unknown files', () => {
    const manifest = ImportManifest.load(manifestPath);
    manifest.markFile('/path/to/file.jsonl', 'abc123', 5);
    expect(manifest.hasFile('/other/file.jsonl')).toBe(false);
  });

  it('tracks chunk count per file', () => {
    const manifest = ImportManifest.load(manifestPath);
    manifest.markFile('/path/to/file.jsonl', 'abc123', 12);
    manifest.save();

    const reloaded = ImportManifest.load(manifestPath);
    const entry = reloaded.getEntry('/path/to/file.jsonl');
    expect(entry?.chunksImported).toBe(12);
    expect(entry?.fileHash).toBe('abc123');
  });

  it('reports total files and chunks', () => {
    const manifest = ImportManifest.load(manifestPath);
    manifest.markFile('/a.jsonl', 'hash1', 5);
    manifest.markFile('/b.jsonl', 'hash2', 10);
    expect(manifest.totalFiles).toBe(2);
    expect(manifest.totalChunks).toBe(15);
  });
});
