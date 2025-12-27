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

export class GccFocusProvider {
  private noiseDecorationType =
      vscode.window.createTextEditorDecorationType({opacity : '0.2'});

  private activeEditors = new Set<string>(); // Store URI strings for safety

  public toggleFocusMode(editor: vscode.TextEditor) {
    if (!editor)
      return;

    const key = editor.document.uri.toString();

    if (this.activeEditors.has(key)) {
      // TURN OFF
      editor.setDecorations(this.noiseDecorationType, []);
      this.activeEditors.delete(key);
      vscode.window.setStatusBarMessage("Focus Mode: OFF", 2000);
      this.updateContext(false); // Update UI
    } else {
      // TURN ON
      this.applyDecoration(editor);
      this.activeEditors.add(key);
      vscode.window.setStatusBarMessage("Focus Mode: ON (Noise Hidden)", 2000);
      this.updateContext(true); // Update UI
    }
  }

  // Helper to check state for a specific editor
  public isActive(editor: vscode.TextEditor): boolean {
    return this.activeEditors.has(editor.document.uri.toString());
  }

  // Restore state when switching tabs
  public restoreState(editor: vscode.TextEditor) {
    const active = this.isActive(editor);
    if (active) {
      this.applyDecoration(editor);
    }
    // Sync the button state to match this specific tab
    this.updateContext(active);
  }

  // Tell VS Code to show/hide the "Eye" button
  private updateContext(isActive: boolean) {
    vscode.commands.executeCommand('setContext', 'gcc-dump.focusModeActive',
                                   isActive);
  }

  private applyDecoration(editor: vscode.TextEditor) {
    const text = editor.document.getText();
    const noiseRanges: vscode.Range[] = [];
    // Regex: Matches notes, clobbers, barriers, uses, and ;; comments
    const noiseRegex = /^\s*(\(note|\(clobber|\(barrier|\(use|;;).*$/gm;

    let match;
    while ((match = noiseRegex.exec(text))) {
      const startPos = editor.document.positionAt(match.index);
      const endPos = editor.document.positionAt(match.index + match[0].length);
      noiseRanges.push(new vscode.Range(startPos, endPos));
    }
    editor.setDecorations(this.noiseDecorationType, noiseRanges);
  }
}