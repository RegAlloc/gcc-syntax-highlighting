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
exports.GccMdSymbolProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class GccMdSymbolProvider {
    async provideDefinition(document, position) {
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange)
            return null;
        // Clean the word: remove quotes if the user clicked "type" inside "set_attr"
        const word = document.getText(wordRange).replace(/"/g, '');
        const currentDir = path.dirname(document.uri.fsPath);
        const files = fs.readdirSync(currentDir).filter(f => f.endsWith('.md'));
        // Prioritize current file, then search all .md files in the backend directory
        const sortedFiles = [
            document.uri.fsPath,
            ...files.map(f => path.join(currentDir, f)).filter(p => p !== document.uri.fsPath)
        ];
        for (const filePath of sortedFiles) {
            if (!fs.existsSync(filePath))
                continue;
            const content = fs.readFileSync(filePath, 'utf8');
            /**
             * Regex Explanation:
             * 1. \\(define_attr\\s+"${word}" -> Matches (define_attr "type"
             * 2. \\(define_[a-z]+_(iterator|attr)\\s+${word}\\b -> Matches (define_mode_iterator INT1
             */
            const pattern = new RegExp(`\\(define_(attr\\s+"${word}"|[a-z]+_(iterator|attr)\\s+${word}\\b)`, 'm');
            const match = content.match(pattern);
            if (match && match.index !== undefined) {
                const textBefore = content.substring(0, match.index);
                const lines = textBefore.split('\n');
                const lineNum = lines.length - 1;
                const charNum = lines[lineNum].length;
                return new vscode.Location(vscode.Uri.file(filePath), new vscode.Position(lineNum, charNum));
            }
        }
        return null;
    }
}
exports.GccMdSymbolProvider = GccMdSymbolProvider;
//# sourceMappingURL=mdSymbolProvider.js.map