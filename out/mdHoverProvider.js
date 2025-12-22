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
exports.GccMdHoverProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class GccMdHoverProvider {
    async provideHover(document, position) {
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange)
            return null;
        // Clean the word: remove quotes if the user hovers over "type"
        const word = document.getText(wordRange).replace(/"/g, '');
        const result = await this.findDefinitionWithComments(document, word);
        if (!result)
            return null;
        const markdown = new vscode.MarkdownString();
        markdown.appendMarkdown(`#### 💡 Documentation: **${word}**\n`);
        if (result.comments) {
            markdown.appendMarkdown(`${result.comments}\n\n---\n`);
        }
        markdown.appendCodeblock(result.definition, 'gcc-md');
        return new vscode.Hover(markdown);
    }
    async findDefinitionWithComments(document, name) {
        const currentDir = path.dirname(document.uri.fsPath);
        const files = fs.readdirSync(currentDir).filter(f => f.endsWith('.md'));
        const sortedFiles = [
            document.uri.fsPath,
            ...files.map(f => path.join(currentDir, f)).filter(p => p !== document.uri.fsPath)
        ];
        for (const filePath of sortedFiles) {
            if (!fs.existsSync(filePath))
                continue;
            const content = fs.readFileSync(filePath, 'utf8');
            const defPattern = new RegExp(`\\(define_(attr\\s+"${name}"|[a-z]+_(iterator|attr)\\s+${name}\\b)`, 'm');
            const match = content.match(defPattern);
            if (match && match.index !== undefined) {
                // Extract the full block by balancing parentheses
                const definition = this.extractBalancedBlock(content.substring(match.index));
                // Extract comments directly above the definition
                const linesBefore = content.substring(0, match.index).split('\n');
                let comments = [];
                for (let i = linesBefore.length - 1; i >= 0; i--) {
                    const line = linesBefore[i].trim();
                    // Keep walking up as long as we see comments or empty lines
                    if (line.startsWith(';') || line === '') {
                        if (line.startsWith(';')) {
                            comments.unshift(line.replace(/^;+\s*/, ''));
                        }
                    }
                    else {
                        break;
                    }
                }
                return {
                    definition: definition,
                    comments: comments.join('  \n')
                };
            }
        }
        return null;
    }
    extractBalancedBlock(text) {
        let depth = 0;
        let endIdx = 0;
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
exports.GccMdHoverProvider = GccMdHoverProvider;
//# sourceMappingURL=mdHoverProvider.js.map