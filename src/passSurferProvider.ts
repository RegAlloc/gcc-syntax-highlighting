import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export class GccPassSurferProvider {

  public async navigate(editor: vscode.TextEditor, direction: 'next'|'prev') {
    if (!editor)
      return;

    const currentUri = editor.document.uri;
    const currentPath = currentUri.fsPath;
    const currentDir = path.dirname(currentPath);
    const fileName = path.basename(currentPath);

    // 1. Parse current file
    const regex = /^(.+)\.(\d{3})([tri])\.([^.]+)$/;
    const match = regex.exec(fileName);

    if (!match) {
      vscode.window.showInformationMessage(
          "Not a GCC dump file (Format: name.123r.pass)");
      return;
    }

    const baseName = match[1];
    const typeChar = match[3];

    // 2. Scan & Sort siblings
    let files: string[] = [];
    try {
      files = await fs.promises.readdir(currentDir);
    } catch (e) {
      return;
    }

    const siblings = files
                         .filter(f => {
                           const m = regex.exec(f);
                           return m && m[1] === baseName && m[3] === typeChar;
                         })
                         .sort((a, b) => {
                           const numA = parseInt(regex.exec(a)![2]);
                           const numB = parseInt(regex.exec(b)![2]);
                           return numA - numB;
                         });

    // 3. Find Target
    const currentIndex = siblings.indexOf(fileName);
    if (currentIndex === -1)
      return;

    let targetIndex = -1;
    if (direction === 'next')
      targetIndex = currentIndex + 1;
    else
      targetIndex = currentIndex - 1;

    if (targetIndex < 0 || targetIndex >= siblings.length) {
      vscode.window.setStatusBarMessage(`No ${direction} pass available.`,
                                        2000);
      return;
    }

    const targetFile = siblings[targetIndex];
    const targetUri = vscode.Uri.file(path.join(currentDir, targetFile));

    // 4. Capture State
    const selection = editor.selection;
    const visibleRanges = editor.visibleRanges;

    // 5. Open the Document
    // preview: false forces a real tab to be created.
    const doc = await vscode.workspace.openTextDocument(targetUri);

    const newEditor = await vscode.window.showTextDocument(
        doc, {viewColumn : vscode.ViewColumn.Active, preview : false});

    // 6. The Fix: Correct Command for Tabs
    if (direction === 'prev') {
      // Wait briefly for the tab to initialize
      await new Promise(resolve => setTimeout(resolve, 50));

      // CORRECT COMMAND: 'moveEditorLeftInGroup' (Moves tab left)
      // OLD COMMAND: 'moveActiveEditorLeft' (Moves to left Split Pane - wrong!)
      await vscode.commands.executeCommand(
          'workbench.action.moveEditorLeftInGroup');
    }

    // 7. Restore Cursor
    newEditor.selection = selection;
    if (visibleRanges.length > 0) {
      const rangeToReveal =
          new vscode.Range(selection.active, selection.active);
      newEditor.revealRange(rangeToReveal,
                            vscode.TextEditorRevealType.InCenter);
    }
  }
}