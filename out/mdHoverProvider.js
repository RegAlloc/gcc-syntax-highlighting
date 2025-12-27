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
class GccMdHoverProvider {
    mdCache;
    rtlCache;
    constructor(mdCache, rtlCache) {
        this.mdCache = mdCache;
        this.rtlCache = rtlCache;
    }
    // No forbidden words. No static dictionaries.
    // We trust the caches to contain the truth.
    constraintModifiers = /^[\=\+\&\%\?\!\*\#\^]+/;
    provideHover(document, position) {
        const lineText = document.lineAt(position.line).text;
        const wordInfo = this.getWordUnderCursor(lineText, position.character);
        if (!wordInfo)
            return null;
        const { word, isQuoted, isBracketed } = wordInfo;
        const cleanWord = word.replace(this.constraintModifiers, '');
        // --- LAYER 1: MD CACHE (Iterators, Attributes, Constraints) ---
        const candidates = this.mdCache.getAllSymbols(document.uri, cleanWord);
        let bestMatch;
        if (candidates.length > 0) {
            if (isQuoted) {
                bestMatch = candidates.find(s => s.type === 'constraint');
                if (!bestMatch)
                    bestMatch = candidates.find(s => s.type === 'predicate');
                if (!bestMatch)
                    bestMatch = candidates.find(s => s.type === 'attribute');
            }
            else {
                if (isBracketed) {
                    bestMatch = candidates.find(s => s.type === 'iterator');
                    if (!bestMatch)
                        bestMatch = candidates.find(s => s.type === 'attribute');
                }
                else {
                    bestMatch = candidates.find(s => s.type === 'iterator');
                    if (!bestMatch)
                        bestMatch = candidates.find(s => s.type === 'constant');
                    if (!bestMatch)
                        bestMatch = candidates.find(s => s.type === 'unspec');
                }
            }
        }
        if (bestMatch) {
            const markdown = new vscode.MarkdownString();
            markdown.appendMarkdown(`#### 💡**${cleanWord}**\n`);
            if (bestMatch.comments)
                markdown.appendMarkdown(`${bestMatch.comments}\n\n---\n`);
            markdown.appendCodeblock(bestMatch.definition, 'gcc-md');
            return new vscode.Hover(markdown);
        }
        // --- LAYER 2: RTL CACHE (Source of Truth) ---
        // Now handles 'match_operand', 'set', 'clobber', etc. dynamically
        if (!isQuoted) {
            const rtlExplanation = this.rtlCache.getExplanation(cleanWord);
            if (rtlExplanation) {
                const markdown = new vscode.MarkdownString();
                markdown.appendMarkdown(`#### 📘**${cleanWord}**\n`);
                markdown.appendMarkdown(`${rtlExplanation}`);
                return new vscode.Hover(markdown);
            }
        }
        return null;
    }
    // (Robust Parser - Same as before)
    getWordUnderCursor(line, charIndex) {
        let inString = false;
        let startQuote = -1;
        for (let i = 0; i < line.length; i++) {
            if (line[i] === '"') {
                if (inString) {
                    if (charIndex > startQuote && charIndex <= i) {
                        return this.parseConstraintList(line.substring(startQuote + 1, i), charIndex - (startQuote + 1));
                    }
                    inString = false;
                }
                else {
                    inString = true;
                    startQuote = i;
                }
            }
        }
        let start = charIndex;
        while (start > 0 && /[a-zA-Z0-9_<>]/.test(line[start - 1]))
            start--;
        let end = charIndex;
        while (end < line.length && /[a-zA-Z0-9_<>]/.test(line[end]))
            end++;
        const rawToken = line.substring(start, end);
        if (rawToken.includes('<') || rawToken.includes('>')) {
            return {
                word: rawToken.replace(/[<>]/g, ''),
                isQuoted: false,
                isBracketed: true
            };
        }
        start = charIndex;
        while (start > 0 && /[a-zA-Z0-9_]/.test(line[start - 1]))
            start--;
        end = charIndex;
        while (end < line.length && /[a-zA-Z0-9_]/.test(line[end]))
            end++;
        const bareWord = line.substring(start, end);
        if (bareWord.length > 0)
            return { word: bareWord, isQuoted: false, isBracketed: false };
        return null;
    }
    parseConstraintList(content, relativeCursor) {
        let currentPos = 0;
        const parts = content.split(',');
        for (const part of parts) {
            if (relativeCursor >= currentPos &&
                relativeCursor <= currentPos + part.length) {
                return { word: part.trim(), isQuoted: true, isBracketed: false };
            }
            currentPos += part.length + 1;
        }
        return { word: content.trim(), isQuoted: true, isBracketed: false };
    }
}
exports.GccMdHoverProvider = GccMdHoverProvider;
//# sourceMappingURL=mdHoverProvider.js.map