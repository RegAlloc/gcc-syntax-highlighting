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

interface PassFile {
  uri: vscode.Uri;
  filename: string;
  number: number;
  type: 't'|'r'; // t = gimple, r = rtl
  name: string;
}

export class GccPassDiffProvider {

  public async compareWithPrevious(currentUri: vscode.Uri) {
    const dir = path.dirname(currentUri.fsPath);
    const currentFilename = path.basename(currentUri.fsPath);

    // 1. Parse the current file: test.c.286r.combine
    const fileRegex = /^(.+)\.(\d{3})([tri])\.(.+)$/;
    const match = fileRegex.exec(currentFilename);

    if (!match) {
      vscode.window.showErrorMessage(
          `Current file does not look like a GCC dump (Format: name.123r.pass).`);
      return;
    }

    const [_, baseName, numStr, type, passName] = match;
    const currentNum = parseInt(numStr, 10);

    // 2. Scan directory for siblings
    const files = await fs.promises.readdir(dir);
    const siblings: PassFile[] = [];

    for (const f of files) {
      // Must start with the same base name (e.g. test.c)
      if (!f.startsWith(baseName + '.'))
        continue;

      // FIX: Explicitly ignore .dot graph files to prevent duplicate/ambiguous
      // matches
      if (f.endsWith('.dot'))
        continue;

      const m = fileRegex.exec(f);
      if (m) {
        siblings.push({
          uri : vscode.Uri.file(path.join(dir, f)),
          filename : f,
          number : parseInt(m[2], 10),
          type : m[3] as 't' | 'r',
          name : m[4]
        });
      }
    }

    // 3. Sort by Pass Number
    siblings.sort((a, b) => a.number - b.number);

    // 4. Find the "Previous" Set
    const validPrevious = siblings.filter(s => s.number < currentNum);

    if (validPrevious.length === 0) {
      vscode.window.showInformationMessage(
          `No previous pass found before ${currentFilename}.`);
      return;
    }

    // Get the highest number from the list (closest to current)
    const prevNum = validPrevious[validPrevious.length - 1].number;

    // Collect all files sharing that previous number
    const candidates = validPrevious.filter(s => s.number === prevNum);

    // 5. Execute Diff
    if (candidates.length === 1) {
      // Perfect case: Only one file exists for the previous pass
      this.openDiff(candidates[0].uri, currentUri, candidates[0].filename,
                    currentFilename);
    } else {
      // Ambiguous case: Multiple files have the same previous ID
      const selected = await vscode.window.showQuickPick(
          candidates.map(c => ({
                           label : c.filename,
                           description : `Pass ${c.number}`,
                           uri : c.uri
                         })),
          {
            placeHolder :
                `Select which pass ${prevNum} file to compare against:`
          });

      if (selected) {
        this.openDiff(selected.uri, currentUri, selected.label,
                      currentFilename);
      }
    }
  }

  private openDiff(left: vscode.Uri, right: vscode.Uri, leftName: string,
                   rightName: string) {
    const title = `${leftName} ↔ ${rightName}`;
    vscode.commands.executeCommand('vscode.diff', left, right, title);
  }
}