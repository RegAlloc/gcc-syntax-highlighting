import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class GccMdSymbolProvider implements vscode.DefinitionProvider {
    public async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<vscode.Definition | null> {
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) return null;
        const word = document.getText(wordRange);

        // 1. Search in the current file first
        let location = this.findInFile(document.uri, document.getText(), word);
        if (location) return location;

        // 2. Search in all included files
        return this.findInIncludes(document, word);
    }

    private findInFile(uri: vscode.Uri, text: string, name: string): vscode.Location | null {
        // This regex matches mode, code, int, and subst iterators/attributes
        // Example: (define_mode_iterator INT1 ...
        // Example: (define_code_attr return_str ...
        const pattern = new RegExp(`\\(define_(mode|code|int|subst)_(iterator|attr)\\s+${name}\\b`, 'm');
        const match = text.match(pattern);

        if (match && match.index !== undefined) {
            const lines = text.substring(0, match.index).split('\n');
            const line = lines.length - 1;
            const character = lines[line].length;
            return new vscode.Location(uri, new vscode.Position(line, character));
        }
        return null;
    }

    private async findInIncludes(document: vscode.TextDocument, name: string): Promise<vscode.Location | null> {
        const text = document.getText();
        const includeRegex = /\(include\s+"([^"]+)"\)/g;
        let match;

        while ((match = includeRegex.exec(text)) !== null) {
            const fileName = match[1];
            const currentDir = path.dirname(document.uri.fsPath);
            const filePath = path.resolve(currentDir, fileName);

            if (fs.existsSync(filePath)) {
                const includeUri = vscode.Uri.file(filePath);
                const includeDoc = await vscode.workspace.openTextDocument(includeUri);
                const location = this.findInFile(includeUri, includeDoc.getText(), name);
                if (location) return location;
            }
        }
        return null;
    }
}