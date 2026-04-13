import * as fs from 'fs';
import * as path from 'path';
import { ImportManifestData, ImportedFileEntry } from './types';

export class ImportManifest {
  private data: ImportManifestData;
  private filePath: string;

  private constructor(filePath: string, data: ImportManifestData) {
    this.filePath = filePath;
    this.data = data;
  }

  static load(filePath: string): ImportManifest {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data: ImportManifestData = JSON.parse(raw);
      return new ImportManifest(filePath, data);
    }
    return new ImportManifest(filePath, { importedFiles: {} });
  }

  save(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }

  hasFile(filePath: string): boolean {
    return filePath in this.data.importedFiles;
  }

  getEntry(filePath: string): ImportedFileEntry | undefined {
    return this.data.importedFiles[filePath];
  }

  markFile(filePath: string, fileHash: string, chunksImported: number): void {
    this.data.importedFiles[filePath] = {
      fileHash,
      chunksImported,
      importedAt: new Date().toISOString(),
    };
  }

  get totalFiles(): number {
    return Object.keys(this.data.importedFiles).length;
  }

  get totalChunks(): number {
    return Object.values(this.data.importedFiles).reduce(
      (sum, entry) => sum + entry.chunksImported,
      0,
    );
  }
}
