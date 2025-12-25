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
class GccMdSymbolProvider {
    cache;
    constructor(cache) {
        this.cache = cache;
    }
    forbiddenWords = new Set([
        'match_dup', 'match_operand', 'match_scratch', 'match_operator', 'set',
        'clobber', 'const_int', 'const_string'
    ]);
    // Constraint modifiers to strip: =, +, &, %, ?, !, *, #, ^
    constraintModifiers = /^[\=\+\&\%\?\!\*\#\^]+/;
    provideDefinition(document, position) {
        const lineText = document.lineAt(position.line).text;
        // 1. Check if cursor is inside quotes "..."
        const wordInfo = this.getWordUnderCursor(lineText, position.character);
        if (!wordInfo)
            return null;
        const { word, isQuoted, isBracketed } = wordInfo;
        const cleanWord = word.replace(this.constraintModifiers, ''); // Strip '=r' -> 'r'
        if (this.forbiddenWords.has(cleanWord))
            return null;
        // 2. Determine Priority
        let candidates = [];
        if (isQuoted) {
            // If quoted, we now treat it specifically as a Constraint/Predicate list
            // item This handles "r,I,L,eI" -> clicking 'eI' searches for constraint
            // "eI"
            candidates = this.cache.getAllSymbols(document.uri, cleanWord);
            // Priority: Constraint > Predicate > Attribute
            let bestMatch = candidates.find(s => s.type === 'constraint');
            if (!bestMatch)
                bestMatch = candidates.find(s => s.type === 'predicate');
            if (!bestMatch)
                bestMatch = candidates.find(s => s.type === 'attribute');
            if (bestMatch) {
                return new vscode.Location(bestMatch.uri, new vscode.Position(bestMatch.line, bestMatch.character));
            }
        }
        else {
            // Standard Logic for Unquoted (Iterators/Attributes)
            candidates = this.cache.getAllSymbols(document.uri, cleanWord);
            if (isBracketed) {
                // <MODE> -> Iterator/Attribute
                let bestMatch = candidates.find(s => s.type === 'iterator');
                if (!bestMatch)
                    bestMatch = candidates.find(s => s.type === 'attribute');
                if (bestMatch)
                    return new vscode.Location(bestMatch.uri, new vscode.Position(bestMatch.line, bestMatch.character));
            }
            else {
                // Bare word -> Iterator > Constant
                let bestMatch = candidates.find(s => s.type === 'iterator');
                if (!bestMatch)
                    bestMatch = candidates.find(s => s.type === 'constant');
                if (!bestMatch)
                    bestMatch = candidates.find(s => s.type === 'unspec');
                if (bestMatch)
                    return new vscode.Location(bestMatch.uri, new vscode.Position(bestMatch.line, bestMatch.character));
            }
        }
        return null;
    }
    // --- ROBUST PARSER ---
    getWordUnderCursor(line, charIndex) {
        // 1. Check for Quoted String Context: "..."
        // We look for a quote pair that encloses the cursor
        let inString = false;
        let startQuote = -1;
        for (let i = 0; i < line.length; i++) {
            if (line[i] === '"') {
                if (inString) {
                    // Closing quote
                    if (charIndex > startQuote && charIndex <= i) {
                        // FOUND: Cursor is inside quotes [startQuote, i]
                        const content = line.substring(startQuote + 1, i);
                        const relativeCursor = charIndex - (startQuote + 1);
                        // Handle Comma-Separated Constraints: "r,I,L,eI"
                        // We find the specific segment the cursor is on
                        return this.parseConstraintList(content, relativeCursor);
                    }
                    inString = false;
                }
                else {
                    // Opening quote
                    inString = true;
                    startQuote = i;
                }
            }
        }
        // 2. Check for Bracketed Context: <...>
        // Simple regex fallback for iterators since they don't contain commas
        // usually Find the word boundaries around the cursor
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
        // 3. Fallback: Bare word (constants, unspecs)
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
        // Split by comma to handle "r,I,L,eI"
        let currentPos = 0;
        const parts = content.split(',');
        for (const part of parts) {
            const partLen = part.length;
            // Check if cursor falls within this segment (accounting for the comma)
            // relativeCursor is 0-based index inside "r,I,L"
            if (relativeCursor >= currentPos &&
                relativeCursor <= currentPos + partLen) {
                return { word: part.trim(), isQuoted: true, isBracketed: false };
            }
            currentPos += partLen + 1; // +1 for the comma
        }
        // Fallback (shouldn't happen if math is right)
        return { word: content.trim(), isQuoted: true, isBracketed: false };
    }
}
exports.GccMdSymbolProvider = GccMdSymbolProvider;
//# sourceMappingURL=mdSymbolProvider.js.map