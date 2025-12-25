import * as vscode from 'vscode';

import {GccMdCache, GccSymbol} from './mdCache';
import {RtlDefCache} from './rtlCache';

export class GccMdHoverProvider implements vscode.HoverProvider {
  constructor(private mdCache: GccMdCache, private rtlCache: RtlDefCache) {}

  // No forbidden words. No static dictionaries.
  // We trust the caches to contain the truth.
  private readonly constraintModifiers = /^[\=\+\&\%\?\!\*\#\^]+/;

  public provideHover(document: vscode.TextDocument,
                      position: vscode.Position): vscode.Hover|null {
    const lineText = document.lineAt(position.line).text;
    const wordInfo = this.getWordUnderCursor(lineText, position.character);
    if (!wordInfo)
      return null;

    const {word, isQuoted, isBracketed} = wordInfo;
    const cleanWord = word.replace(this.constraintModifiers, '');

    // --- LAYER 1: MD CACHE (Iterators, Attributes, Constraints) ---
    const candidates = this.mdCache.getAllSymbols(document.uri, cleanWord);
    let bestMatch: GccSymbol|undefined;

    if (candidates.length > 0) {
      if (isQuoted) {
        bestMatch = candidates.find(s => s.type === 'constraint');
        if (!bestMatch)
          bestMatch = candidates.find(s => s.type === 'predicate');
        if (!bestMatch)
          bestMatch = candidates.find(s => s.type === 'attribute');
      } else {
        if (isBracketed) {
          bestMatch = candidates.find(s => s.type === 'iterator');
          if (!bestMatch)
            bestMatch = candidates.find(s => s.type === 'attribute');
        } else {
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
      markdown.appendMarkdown(
          `### 💡 GCC (${bestMatch.type}): **${cleanWord}**\n`);
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
        markdown.appendMarkdown(`### 📘 RTL Operation: **${cleanWord}**\n`);
        markdown.appendMarkdown(`${rtlExplanation}`);
        return new vscode.Hover(markdown);
      }
    }

    return null;
  }

  // (Robust Parser - Same as before)
  private getWordUnderCursor(line: string, charIndex: number):
      {word: string, isQuoted: boolean, isBracketed: boolean}|null {
    let inString = false;
    let startQuote = -1;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') {
        if (inString) {
          if (charIndex > startQuote && charIndex <= i) {
            return this.parseConstraintList(line.substring(startQuote + 1, i),
                                            charIndex - (startQuote + 1));
          }
          inString = false;
        } else {
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
        word : rawToken.replace(/[<>]/g, ''),
        isQuoted : false,
        isBracketed : true
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
      return {word : bareWord, isQuoted : false, isBracketed : false};
    return null;
  }

  private parseConstraintList(content: string, relativeCursor: number):
      {word: string, isQuoted: boolean, isBracketed: boolean} {
    let currentPos = 0;
    const parts = content.split(',');
    for (const part of parts) {
      if (relativeCursor >= currentPos &&
          relativeCursor <= currentPos + part.length) {
        return {word : part.trim(), isQuoted : true, isBracketed : false};
      }
      currentPos += part.length + 1;
    }
    return {word : content.trim(), isQuoted : true, isBracketed : false};
  }
}