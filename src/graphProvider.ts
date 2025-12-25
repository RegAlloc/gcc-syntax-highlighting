import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export class GccGraphProvider {

  public async openDotFile(editor: vscode.TextEditor) {
    if (!editor)
      return;

    // 1. Check for Extension
    const graphvizExt = vscode.extensions.getExtension(
        'tintinweb.graphviz-interactive-preview');
    if (!graphvizExt) {
      const msg =
          "Graphviz extension not found! Please install 'tintinweb.graphviz-interactive-preview'.";
      const choice =
          await vscode.window.showErrorMessage(msg, "Install Extension");
      if (choice === "Install Extension") {
        vscode.commands.executeCommand(
            'extension.open', 'tintinweb.graphviz-interactive-preview');
      }
      return;
    }

    const currentUri = editor.document.uri;
    const currentPath = currentUri.fsPath;
    const fileName = path.basename(currentPath);

    // Capture original document info
    const originalColumn = editor.viewColumn || vscode.ViewColumn.One;
    const originalDoc = editor.document;

    // 2. Logic: Look for the .dot file
    const dotPath = currentPath + '.dot';

    if (fs.existsSync(dotPath)) {
      const dotUri = vscode.Uri.file(dotPath);

      try {
        // 3. Open the .dot file (Force Focus so extension sees it)
        const dotDoc = await vscode.workspace.openTextDocument(dotUri);
        await vscode.window.showTextDocument(
            dotDoc, {viewColumn : originalColumn, preserveFocus : false});

        // 4. Trigger the Preview (Opens in Side Column)
        await vscode.commands.executeCommand(
            'graphviz-interactive-preview.preview.beside');

        // 5. CLEANUP SEQUENCE
        // We delay slightly to let the Preview initialize its data from the
        // file.
        setTimeout(async () => {
          // Step A: Ensure focus is back on the .dot file (Column 1)
          // (Just in case the Preview stole focus)
          await vscode.window.showTextDocument(
              dotDoc, {viewColumn : originalColumn, preserveFocus : false});

          // Step B: Close the Active Editor (which is now the .dot file)
          await vscode.commands.executeCommand(
              'workbench.action.closeActiveEditor');

          // Step C: Ensure the Original Dump is visible/focused
          // (Usually happens automatically when tab closes, but this guarantees
          // it)
          await vscode.window.showTextDocument(
              originalDoc,
              {viewColumn : originalColumn, preserveFocus : false});
        }, 250); // 250ms is usually enough for the extension to parse the graph

      } catch (error: any) {
        vscode.window.showErrorMessage(
            `Graphviz Error: ${error.message || error}`);
      }
    } else {
      // Smart Error Logic
      const suggestion = this.generateFlagSuggestion(fileName);
      const msg = `Graph file not found! Recompile with: ${suggestion}`;

      const selection = await vscode.window.showErrorMessage(msg, "Copy Flag");
      if (selection === "Copy Flag") {
        await vscode.env.clipboard.writeText(suggestion);
      }
    }
  }

  private generateFlagSuggestion(fileName: string): string {
    const regex = /^(.+)\.(\d{3})([tri])\.([^.]+)$/;
    const match = regex.exec(fileName);

    if (!match)
      return "-fdump-[tree|rtl|ipa]-<pass>-graph";

    const typeChar = match[3];
    const passName = match[4];

    let typeStr = "";
    if (typeChar === 'r')
      typeStr = "rtl";
    else if (typeChar === 't')
      typeStr = "tree";
    else if (typeChar === 'i')
      typeStr = "ipa";

    return `-fdump-${typeStr}-${passName}-graph`;
  }
}