import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface GccSymbol {
    definition: string;
    comments: string;
    uri: vscode.Uri;
    line: number;
    character: number;
}

export class GccMdCache {
    private symbols = new Map<string, GccSymbol>();
    private wordFilesMap = new Map<string, Set<string>>();

    public clear() {
        this.symbols.clear();
        this.wordFilesMap.clear();
    }

    public async initialize(rootUri: vscode.Uri) {
        this.clear(); // Wipe the cache when switching backends
        const currentDir = path.dirname(rootUri.fsPath);
        
        // Index local files
        await this.indexDirectory(currentDir);
        
        // Index common.md relative to the current file
        const commonMd = path.resolve(currentDir, '../../common.md');
        if (fs.existsSync(commonMd)) await this.indexFile(vscode.Uri.file(commonMd));
    }

    public async indexDirectory(dirPath: string) {
        const files = await fs.promises.readdir(dirPath);
        const mdFiles = files.filter(f => f.endsWith('.md')).map(f => path.join(dirPath, f));
        await Promise.all(mdFiles.map(f => this.indexFile(vscode.Uri.file(f))));
    }

    public async indexFile(uri: vscode.Uri) {
        try {
            const content = await fs.promises.readFile(uri.fsPath, 'utf8');
            const filePath = uri.fsPath;

            // Remove previous symbols for this specific file
            for (const [name, sym] of this.symbols.entries()) {
                if (sym.uri.fsPath === filePath) this.symbols.delete(name);
            }

            // Regex for all MD definitions
            const defRegex = /\(define_(attr|predicate|special_predicate|constraint|register_constraint)\s+"([^"]+)"|\(define_[a-z]+_(iterator|attr)\s+([a-zA-Z0-9_]+)\b|\(\s*([a-zA-Z0-9_]+)\s+([0-x0-9a-fA-F-]+)\s*\)/g;
            let match;
            while ((match = defRegex.exec(content)) !== null) {
                const name = match[2] || match[4] || match[5];
                if (!name || name === 'const_int' || name === 'set' || name === 'unspec') continue;

                const linesBefore = content.substring(0, match.index).split('\n');
                const lineNum = linesBefore.length - 1;

                this.symbols.set(name, {
                    definition: this.extractBalancedBlock(content.substring(match.index)),
                    comments: this.getComments(linesBefore),
                    uri: uri,
                    line: lineNum,
                    character: linesBefore[lineNum].length
                });
            }

            // Update Reference Map
            const words = new Set(content.split(/[^a-zA-Z0-9_]+/));
            words.forEach(word => {
                if (!this.wordFilesMap.has(word)) this.wordFilesMap.set(word, new Set());
                this.wordFilesMap.get(word)!.add(filePath);
            });
        } catch (e) {}
    }

    public getSymbol(name: string) { return this.symbols.get(name); }
    public getFilesWithWord(word: string) { return Array.from(this.wordFilesMap.get(word) || []); }

    private getComments(lines: string[]): string {
        let comments: string[] = [];
        for (let i = lines.length - 1; i >= 0; i--) {
            const l = lines[i].trim();
            if (l.startsWith(';')) comments.unshift(l.replace(/^;+\s*/, ''));
            else if (l !== '') break;
        }
        return comments.join('  \n');
    }

    private extractBalancedBlock(text: string): string {
        let depth = 0, endIdx = 0;
        for (let i = 0; i < text.length; i++) {
            if (text[i] === '(') depth++;
            else if (text[i] === ')') depth--;
            if (depth === 0 && i > 0) { endIdx = i + 1; break; }
        }
        return text.substring(0, endIdx || text.indexOf(')'));
    }
}