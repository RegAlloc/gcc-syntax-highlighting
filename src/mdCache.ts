import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export type SymbolType =
    'iterator'|'attribute'|'constraint'|'predicate'|'constant'|'unspec';

export interface GccSymbol {
  definition: string;
  comments: string;
  uri: vscode.Uri;
  line: number;
  character: number;
  type: SymbolType;
}

class BackendContext {
  public symbols = new Map<string, GccSymbol[]>();
  public wordFilesMap = new Map<string, Set<string>>();
  public processingFiles = new Set<string>();

  public clear() {
    this.symbols.clear();
    this.wordFilesMap.clear();
    this.processingFiles.clear();
  }
}

export class GccMdCache {
  private contexts = new Map<string, BackendContext>();
  private readonly ignoredKeywords = new Set([
    'match_operand', 'match_scratch', 'match_dup', 'match_operator',
    'match_parallel', 'clobber', 'use', 'set', 'const_int', 'const_string'
  ]);

  private getContext(uri: vscode.Uri): BackendContext {
    const dir = path.dirname(uri.fsPath);
    if (!this.contexts.has(dir))
      this.contexts.set(dir, new BackendContext());
    return this.contexts.get(dir)!;
  }

  private findCommonMdPath(startDir: string): string|null {
    let current = startDir;
    for (let i = 0; i < 5; i++) {
      const candidate = path.join(current, 'common.md');
      if (fs.existsSync(candidate))
        return candidate;
      const parent = path.dirname(current);
      if (parent === current)
        break;
      current = parent;
    }
    return null;
  }

  public async indexFile(uri: vscode.Uri, parentCtx?: BackendContext) {
    const ctx = parentCtx || this.getContext(uri);
    const filePath = uri.fsPath;

    if (ctx.processingFiles.has(filePath))
      return;
    ctx.processingFiles.add(filePath);

    try {
      const content = await fs.promises.readFile(filePath, 'utf8');

      // 1. Clean old symbols for this file
      for (const [key, syms] of ctx.symbols.entries()) {
        const filtered = syms.filter(s => s.uri.fsPath !== filePath);
        if (filtered.length > 0)
          ctx.symbols.set(key, filtered);
        else
          ctx.symbols.delete(key);
      }

      // 2. Index content
      const defRegex =
          /\(define_(attr|predicate|special_predicate|constraint|register_constraint|memory_constraint|address_constraint|c_enum)\s+"([^"]+)"|\(define_([a-z]+)_(iterator|attr)\s+([a-zA-Z0-9_]+)\b|\(\s*([a-zA-Z0-9_]+)\s+([0-x0-9a-fA-F-]+)\s*\)/g;

      let match;
      while ((match = defRegex.exec(content)) !== null) {
        // Check for commented-out definitions
        const textBeforeMatch = content.substring(0, match.index);
        const lastNewLine = textBeforeMatch.lastIndexOf('\n');
        const lineStart = lastNewLine === -1 ? 0 : lastNewLine + 1;
        const linePrefix = content.substring(lineStart, match.index).trim();

        if (linePrefix.startsWith(';') || linePrefix.includes(';'))
          continue;

        let name = '';
        let type: SymbolType = 'attribute';

        if (match[2]) {
          name = match[2];
          const t = match[1];
          if (t.includes('constraint'))
            type = 'constraint';
          else if (t.includes('predicate'))
            type = 'predicate';
          else if (t === 'attr')
            type = 'attribute';
          else if (t === 'c_enum')
            type = 'unspec';
        } else if (match[5]) {
          name = match[5];
          const kind = match[4];
          type = kind === 'iterator' ? 'iterator' : 'attribute';
        } else if (match[6]) {
          name = match[6];
          type = 'constant';
        }

        if (!name || this.ignoredKeywords.has(name))
          continue;

        // --- IMPROVED COMMENT EXTRACTION ---
        const lines = textBeforeMatch.split('\n');
        const lineNum = lines.length - 1;
        let comments: string[] = [];

        // Walk backwards from the definition line
        for (let i = lineNum - 1; i >= 0; i--) {
          const l = lines[i].trim();

          if (l === '') {
            // CRITICAL FIX: Stop immediately on a blank line.
            // This prevents merging the definition docs with the File
            // Header/License.
            break;
          }

          if (l.startsWith(';')) {
            // Clean the comment marker but keep the text
            comments.unshift(l.replace(/^;+\s*/, ''));
          } else {
            // Stop if we hit other code
            break;
          }
        }
        // -----------------------------------

        const newSymbol: GccSymbol = {
          definition : content.substring(match.index).split(')')[0] + ')',
          comments : comments.join('\n'),
          uri : uri,
          line : lineNum,
          character : lines[lineNum].length,
          type : type
        };

        if (!ctx.symbols.has(name))
          ctx.symbols.set(name, []);
        ctx.symbols.get(name)!.push(newSymbol);

        // Handle Includes
        if (match[0].includes('include')) {
          const incMatch = /\(include\s+"([^"]+)"\)/.exec(match[0]);
          if (incMatch) {
            const incPath = path.resolve(path.dirname(filePath), incMatch[1]);
            if (fs.existsSync(incPath)) {
              await this.indexFile(vscode.Uri.file(incPath), ctx);
            }
          }
        }
      }

      // Reverse Index
      const words = new Set(content.split(/[^a-zA-Z0-9_]+/));
      words.forEach(word => {
        if (!ctx.wordFilesMap.has(word))
          ctx.wordFilesMap.set(word, new Set());
        ctx.wordFilesMap.get(word)!.add(filePath);
      });

    } catch (e) {
      console.error(`Index Error: ${filePath}`, e);
    } finally {
      ctx.processingFiles.delete(filePath);
    }
  }

  public getAllSymbols(uri: vscode.Uri, name: string): GccSymbol[] {
    const results: GccSymbol[] = [];
    const startDir = path.dirname(uri.fsPath);

    const localCtx = this.contexts.get(startDir);
    if (localCtx) {
      const s = localCtx.symbols.get(name);
      if (s)
        results.push(...s);
    }

    const commonPath = this.findCommonMdPath(startDir);
    if (commonPath) {
      const commonDir = path.dirname(commonPath);
      const commonCtx = this.contexts.get(commonDir);
      if (commonCtx) {
        const s = commonCtx.symbols.get(name);
        if (s)
          results.push(...s);
      }
    }
    return results;
  }

  public getFilesWithWord(uri: vscode.Uri, word: string): string[] {
    const ctx = this.getContext(uri);
    return Array.from(ctx.wordFilesMap.get(word) || []);
  }

  public async forceReindex(uri: vscode.Uri) {
    const dir = path.dirname(uri.fsPath);
    const ctx = this.getContext(uri);
    ctx.clear();

    const files = await fs.promises.readdir(dir);
    await Promise.all(
        files.filter(f => f.endsWith('.md'))
            .map(f => this.indexFile(vscode.Uri.file(path.join(dir, f)))));

    const commonPath = this.findCommonMdPath(dir);
    if (commonPath)
      await this.indexFile(vscode.Uri.file(commonPath));
  }
}