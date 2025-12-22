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
        const word = document.getText(wordRange);
        // 1. Search in the current file first
        let location = this.findInFile(document.uri, document.getText(), word);
        if (location)
            return location;
        // 2. Search in all included files
        return this.findInIncludes(document, word);
    }
    findInFile(uri, text, name) {
        // This regex matches mode, code, int, and subst iterators/attributes
        // Example: (define_mode_iterator INT1 ...
        // Example: (define_code_attr return_str ...
        const pattern = new RegExp(`\\(define_(mode|code|int|subst)_(iterator|attr)\\s+${name}\\b`, 'm');
        const match = text.match(pattern);
        if (match && match.index !== undefined) {
            const lines = text.substring(0, match.index).split('\n');
            const line = lines.length - 1;
            const character = lines[line].length;
            return new vscode.Location(uri, new vscode.Position(line, character));
        }
        return null;
    }
    async findInIncludes(document, name) {
        const text = document.getText();
        const includeRegex = /\(include\s+"([^"]+)"\)/g;
        let match;
        while ((match = includeRegex.exec(text)) !== null) {
            const fileName = match[1];
            const currentDir = path.dirname(document.uri.fsPath);
            const filePath = path.resolve(currentDir, fileName);
            if (fs.existsSync(filePath)) {
                const includeUri = vscode.Uri.file(filePath);
                const includeDoc = await vscode.workspace.openTextDocument(includeUri);
                const location = this.findInFile(includeUri, includeDoc.getText(), name);
                if (location)
                    return location;
            }
        }
        return null;
    }
}
exports.GccMdSymbolProvider = GccMdSymbolProvider;
//# sourceMappingURL=mdSymbolProvider.js.map