/*
 * Copyright (C) 2025 Kishan Parmar
 *
 * This file is part of GCC Workbench.
 *
 * GCC Workbench is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * GCC Workbench is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with GCC Workbench.  If not, see <https://www.gnu.org/licenses/>.
 */

import * as vscode from 'vscode';

import {GccMdCache, GccSymbol, SymbolType} from './mdCache';

export class GccMdSymbolProvider implements vscode.DefinitionProvider {
  constructor(private cache: GccMdCache) {}

  private readonly forbiddenWords = new Set([
    'match_dup', 'match_operand', 'match_scratch', 'match_operator', 'set',
    'clobber', 'const_int', 'const_string'
  ]);

  // Constraint modifiers to strip: =, +, &, %, ?, !, *, #, ^
  private readonly constraintModifiers = /^[\=\+\&\%\?\!\*\#\^]+/;

  public provideDefinition(document: vscode.TextDocument,
                           position: vscode.Position): vscode.Definition|null {
    const lineText = document.lineAt(position.line).text;

    // 1. Check if cursor is inside quotes "..."
    const wordInfo = this.getWordUnderCursor(lineText, position.character);
    if (!wordInfo)
      return null;

    const {word, isQuoted, isBracketed} = wordInfo;
    const cleanWord =
        word.replace(this.constraintModifiers, ''); // Strip '=r' -> 'r'

    if (this.forbiddenWords.has(cleanWord))
      return null;

    // 2. Determine Priority
    let candidates: GccSymbol[] = [];

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
        return new vscode.Location(
            bestMatch.uri,
            new vscode.Position(bestMatch.line, bestMatch.character));
      }
    } else {
      // Standard Logic for Unquoted (Iterators/Attributes)
      candidates = this.cache.getAllSymbols(document.uri, cleanWord);

      if (isBracketed) {
        // <MODE> -> Iterator/Attribute
        let bestMatch = candidates.find(s => s.type === 'iterator');
        if (!bestMatch)
          bestMatch = candidates.find(s => s.type === 'attribute');
        if (bestMatch)
          return new vscode.Location(
              bestMatch.uri,
              new vscode.Position(bestMatch.line, bestMatch.character));
      } else {
        // Bare word -> Iterator > Constant
        let bestMatch = candidates.find(s => s.type === 'iterator');
        if (!bestMatch)
          bestMatch = candidates.find(s => s.type === 'constant');
        if (!bestMatch)
          bestMatch = candidates.find(s => s.type === 'unspec');
        if (bestMatch)
          return new vscode.Location(
              bestMatch.uri,
              new vscode.Position(bestMatch.line, bestMatch.character));
      }
    }

    return null;
  }

  // --- ROBUST PARSER ---
  private getWordUnderCursor(line: string, charIndex: number):
      {word: string, isQuoted: boolean, isBracketed: boolean}|null {
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
        } else {
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
        word : rawToken.replace(/[<>]/g, ''),
        isQuoted : false,
        isBracketed : true
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
      return {word : bareWord, isQuoted : false, isBracketed : false};

    return null;
  }

  private parseConstraintList(content: string, relativeCursor: number):
      {word: string, isQuoted: boolean, isBracketed: boolean} {
    // Split by comma to handle "r,I,L,eI"
    let currentPos = 0;
    const parts = content.split(',');

    for (const part of parts) {
      const partLen = part.length;
      // Check if cursor falls within this segment (accounting for the comma)
      // relativeCursor is 0-based index inside "r,I,L"
      if (relativeCursor >= currentPos &&
          relativeCursor <= currentPos + partLen) {
        return {word : part.trim(), isQuoted : true, isBracketed : false};
      }
      currentPos += partLen + 1; // +1 for the comma
    }

    // Fallback (shouldn't happen if math is right)
    return {word : content.trim(), isQuoted : true, isBracketed : false};
  }
}