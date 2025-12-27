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

export class GCCMdLinkProvider implements vscode.DocumentLinkProvider {
  public provideDocumentLinks(document: vscode.TextDocument):
      vscode.DocumentLink[] {
    const links: vscode.DocumentLink[] = [];
    const text = document.getText();
    const includeRegex = /\(include\s+"([^"]+)"\)/g;
    let match;

    while ((match = includeRegex.exec(text)) !== null) {
      const fileName = match[1];
      // Calculate exact position of the filename for the underline
      const startIdx = match.index + match[0].indexOf(fileName);
      const range =
          new vscode.Range(document.positionAt(startIdx),
                           document.positionAt(startIdx + fileName.length));

      // Resolve the path relative to the current file's directory
      const currentDir = path.dirname(document.uri.fsPath);
      const filePath = path.resolve(currentDir, fileName);

      if (fs.existsSync(filePath)) {
        const targetUri = vscode.Uri.file(filePath);

        // Use the custom command we registered in extension.ts
        // This ensures every click opens a new, permanent tab
        const commandUri = vscode.Uri.parse(`command:gcc-md.openFilePermanent?${
            encodeURIComponent(JSON.stringify([ targetUri ]))}`);

        const link = new vscode.DocumentLink(range, commandUri);
        link.tooltip = `Follow include: ${filePath}`;
        links.push(link);
      }
    }
    return links;
  }
}