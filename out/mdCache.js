"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GccMdCache = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class GccMdCache {
    symbols = new Map();
    wordFilesMap = new Map();
    clear() {
        this.symbols.clear();
        this.wordFilesMap.clear();
    }
    async initialize(rootUri) {
        this.clear(); // Wipe the cache when switching backends
        const currentDir = path.dirname(rootUri.fsPath);
        // Index local files
        await this.indexDirectory(currentDir);
        // Index common.md relative to the current file
        const commonMd = path.resolve(currentDir, '../../common.md');
        if (fs.existsSync(commonMd))
            await this.indexFile(vscode.Uri.file(commonMd));
    }
    async indexDirectory(dirPath) {
        const files = await fs.promises.readdir(dirPath);
        const mdFiles = files.filter(f => f.endsWith('.md')).map(f => path.join(dirPath, f));
        await Promise.all(mdFiles.map(f => this.indexFile(vscode.Uri.file(f))));
    }
    async indexFile(uri) {
        try {
            const content = await fs.promises.readFile(uri.fsPath, 'utf8');
            const filePath = uri.fsPath;
            // Remove previous symbols for this specific file
            for (const [name, sym] of this.symbols.entries()) {
                if (sym.uri.fsPath === filePath)
                    this.symbols.delete(name);
            }
            // Regex for all MD definitions
            const defRegex = /\(define_(attr|predicate|special_predicate|constraint|register_constraint)\s+"([^"]+)"|\(define_[a-z]+_(iterator|attr)\s+([a-zA-Z0-9_]+)\b|\(\s*([a-zA-Z0-9_]+)\s+([0-x0-9a-fA-F-]+)\s*\)/g;
            let match;
            while ((match = defRegex.exec(content)) !== null) {
                const name = match[2] || match[4] || match[5];
                if (!name || name === 'const_int' || name === 'set' || name === 'unspec')
                    continue;
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
                if (!this.wordFilesMap.has(word))
                    this.wordFilesMap.set(word, new Set());
                this.wordFilesMap.get(word).add(filePath);
            });
        }
        catch (e) { }
    }
    getSymbol(name) { return this.symbols.get(name); }
    getFilesWithWord(word) { return Array.from(this.wordFilesMap.get(word) || []); }
    getComments(lines) {
        let comments = [];
        for (let i = lines.length - 1; i >= 0; i--) {
            const l = lines[i].trim();
            if (l.startsWith(';'))
                comments.unshift(l.replace(/^;+\s*/, ''));
            else if (l !== '')
                break;
        }
        return comments.join('  \n');
    }
    extractBalancedBlock(text) {
        let depth = 0, endIdx = 0;
        for (let i = 0; i < text.length; i++) {
            if (text[i] === '(')
                depth++;
            else if (text[i] === ')')
                depth--;
            if (depth === 0 && i > 0) {
                endIdx = i + 1;
                break;
            }
        }
        return text.substring(0, endIdx || text.indexOf(')'));
    }
}
exports.GccMdCache = GccMdCache;
//# sourceMappingURL=mdCache.js.map