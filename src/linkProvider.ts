import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class GCCMdLinkProvider implements vscode.DocumentLinkProvider {
    public provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
        const links: vscode.DocumentLink[] = [];
        const text = document.getText();
        const includeRegex = /\(include\s+"([^"]+)"\)/g;
        let match;

        while ((match = includeRegex.exec(text)) !== null) {
            const fileName = match[1];
            const startIdx = match.index + match[0].indexOf(fileName);
            
            const range = new vscode.Range(
                document.positionAt(startIdx),
                document.positionAt(startIdx + fileName.length)
            );

            const currentDir = path.dirname(document.uri.fsPath);
            const filePath = path.resolve(currentDir, fileName);

            if (fs.existsSync(filePath)) {
                const targetUri = vscode.Uri.file(filePath);

                // This is the critical part: mapping the URI to our custom command
                const commandUri = vscode.Uri.parse(
                    `command:gcc-md.openFilePermanent?${encodeURIComponent(JSON.stringify([targetUri]))}`
                );

                const link = new vscode.DocumentLink(range, commandUri);
                link.tooltip = "Click to open in a new permanent tab";
                links.push(link);
            }
        }
        return links;
    }
}