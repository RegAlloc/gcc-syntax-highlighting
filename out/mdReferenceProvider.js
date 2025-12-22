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
exports.GccMdReferenceProvider = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
class GccMdReferenceProvider {
    cache;
    constructor(cache) {
        this.cache = cache;
    }
    async provideReferences(document, position) {
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange)
            return null;
        const word = document.getText(wordRange).replace(/"/g, '');
        const filesToScan = this.cache.getFilesWithWord(word);
        const locations = [];
        // Scan only relevant files in parallel
        await Promise.all(filesToScan.map(async (filePath) => {
            const content = await fs.promises.readFile(filePath, 'utf8');
            const lines = content.split('\n');
            lines.forEach((lineText, lineIdx) => {
                let startPos = 0;
                while ((startPos = lineText.indexOf(word, startPos)) !== -1) {
                    const endPos = startPos + word.length;
                    // Strict word boundary check
                    const before = lineText[startPos - 1] || ' ';
                    const after = lineText[endPos] || ' ';
                    if (!/[a-zA-Z0-9_]/.test(before) && !/[a-zA-Z0-9_]/.test(after)) {
                        locations.push(new vscode.Location(vscode.Uri.file(filePath), new vscode.Range(lineIdx, startPos, lineIdx, endPos)));
                    }
                    startPos = endPos;
                }
            });
        }));
        return locations;
    }
}
exports.GccMdReferenceProvider = GccMdReferenceProvider;
//# sourceMappingURL=mdReferenceProvider.js.map