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

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export class RtlDefCache {
  // Stores "REG_DEAD" -> "The value in REG dies..."
  private definitions = new Map<string, string>();

  public async initialize(context: vscode.ExtensionContext) {
    // 1. Load rtl.def
    const rtlDefPath = context.asAbsolutePath(path.join('src', 'rtl.def'));
    if (fs.existsSync(rtlDefPath)) {
      const content = await fs.promises.readFile(rtlDefPath, 'utf8');
      this.parseRtlDef(content);
    }

    // 2. Load reg-notes.def
    const regNotesPath =
        context.asAbsolutePath(path.join('src', 'reg-notes.def'));
    if (fs.existsSync(regNotesPath)) {
      const content = await fs.promises.readFile(regNotesPath, 'utf8');
      this.parseRegNotes(content);
    }
  }

  public getExplanation(name: string): string|undefined {
    return this.definitions.get(name);
  }

  // --- PARSER FOR RTL.DEF ---
  private parseRtlDef(content: string) {
    const lines = content.split('\n');
    // Regex matches: DEF_RTL_EXPR(NAME, "name", ...)
    const defRegex = /DEF_RTL_EXPR\s*\(\s*[A-Z0-9_]+,\s*"([^"]+)"/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith('DEF_RTL_EXPR')) {
        const match = defRegex.exec(line);
        if (match) {
          const name = match[1]; 
          
          let docLines: string[] = [];
          let j = i - 1;

          // 1. Skip blank lines immediately above the definition
          while (j >= 0 && lines[j].trim() === '') {
            j--;
          }

          // 2. Parse the C-style comment block
          if (j >= 0 && lines[j].trim().endsWith('*/')) {
             let insideComment = true;
             while (j >= 0 && insideComment) {
                 let commentLine = lines[j].trim();
                 
                 // Remove closing '*/'
                 if (commentLine.endsWith('*/')) {
                     commentLine = commentLine.substring(0, commentLine.length - 2);
                 }
                 // Remove opening '/*'
                 if (commentLine.startsWith('/*')) {
                     commentLine = commentLine.substring(2);
                     insideComment = false; 
                 }
                 
                 // Remove the leading '*' often found in C comments (e.g. " * text")
                 // We trim ONLY the left side to handle the '*', but keep the text
                 commentLine = commentLine.replace(/^\s*\*\s?/, '');

                 // If the line has text, add it. 
                 // Even empty lines in a comment block are useful for paragraph breaks.
                 if (commentLine.length > 0 || docLines.length > 0) {
                     docLines.unshift(commentLine); 
                 }
                 j--;
             }
          }

          // 3. Store in Cache with Markdown Line Breaks
          if (docLines.length > 0) {
            // CRITICAL FIX: Join with "  \n" (Two spaces + Newline)
            // This forces VS Code to render strict line breaks.
            const finalDoc = docLines.join('  \n');
            this.definitions.set(name, finalDoc);
          } else {
            this.definitions.set(name, `**${name}**`);
          }
        }
      }
    }
  }

  // --- PARSER FOR REG-NOTES.DEF ---
  private parseRegNotes(content: string) {
    const lines = content.split('\n');

    // Strict check: Starts with REG_NOTE or REG_CFA_NOTE
    // We exclude #define lines by checking for ^R
    const isDef = (line: string) =>
        /^(REG_NOTE|REG_CFA_NOTE)\s*\(/.test(line.trim());

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (isDef(line)) {
        // REG_NOTE (DEAD)  or  REG_CFA_NOTE (CFA_FLUSH_QUEUE)
        const match =
            /(?:REG_NOTE|REG_CFA_NOTE)\s*\(\s*([A-Z0-9_]+)\s*\)/.exec(line);

        if (match) {
          const rawName = match[1]; // "DEAD"

          // FORCE CONCATENATION: "DEAD" -> "REG_DEAD"
          // This matches the RTL dump format (expr_list:REG_DEAD ...)
          const name = "REG_" + rawName;

          this.extractAndStoreDoc(name, i, lines, isDef);
        }
      }
    }
  }

  // --- SHARED DOCUMENTATION EXTRACTOR ---
  private extractAndStoreDoc(name: string, currentIndex: number,
                             lines: string[], isDefFn: (l: string) => boolean) {
    let doc: string|undefined = undefined;

    // Scan backwards from the current definition
    for (let j = currentIndex - 1; j >= 0; j--) {
      const prevLine = lines[j].trim();

      // 1. Stop conditions
      if (prevLine === '')
        break; // Empty line = End of doc block
      if (prevLine.startsWith('#'))
        continue; // Skip preprocessor (#define, #ifdef)

      // 2. Grouping: If previous line is ALSO a definition, inherit its doc
      if (isDefFn(prevLine)) {
        let prevName = '';

        if (prevLine.startsWith('DEF_RTL_EXPR')) {
          const m =
              /DEF_RTL_EXPR\s*\(\s*[A-Z0-9_]+,\s*"([^"]+)"/.exec(prevLine);
          if (m)
            prevName = m[1];
        } else {
          // Must apply the same REG_ prefix logic for lookups
          const m = /(?:REG_NOTE|REG_CFA_NOTE)\s*\(\s*([A-Z0-9_]+)\s*\)/.exec(
              prevLine);
          if (m)
            prevName = "REG_" + m[1];
        }

        if (prevName) {
          doc = this.definitions.get(prevName);
        }
        break; // Found parent, stop
      }

      // 3. Comment Block: Found "*/"
      if (prevLine.endsWith('*/')) {
        const commentLines: string[] = [];
        // Walk backwards to find "/*"
        for (let k = j; k >= 0; k--) {
          const commentLine = lines[k].trim();
          commentLines.unshift(commentLine);
          if (commentLine.startsWith('/*'))
            break;
        }
        doc = this.formatComment(commentLines);
        break; // Found doc, stop
      }
    }

    if (doc) {
      this.definitions.set(name, doc);
    }
  }

  private formatComment(rawLines: string[]): string {
    return rawLines
        .map(line => {
          let clean = line.trim();
          clean = clean.replace(/^\/\*+/, '')
                      .replace(/\*+\/$/, '');          // Strip start/end /* */
          clean = clean.replace(/^\*+\s?/, '').trim(); // Strip leading *
          return clean;
        })
        .filter((line, index, arr) => {
          // Remove empty lines only from very start/end
          if (line === '' && (index === 0 || index === arr.length - 1))
            return false;
          return true;
        })
        .join('  \n'); // Markdown Hard Break
  }
}