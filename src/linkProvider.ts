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
            const fileNameOffset = match[0].indexOf(fileName);
            
            const range = new vscode.Range(
                document.positionAt(match.index + fileNameOffset),
                document.positionAt(match.index + fileNameOffset + fileName.length)
            );

            const currentDir = path.dirname(document.uri.fsPath);
            const filePath = path.resolve(currentDir, fileName);

            if (fs.existsSync(filePath)) {
                const targetUri = vscode.Uri.file(filePath);

                // Use our custom command and pass the URI as an argument
                const commandUri = vscode.Uri.parse(
                    `command:gcc-md.openFilePermanent?${encodeURIComponent(JSON.stringify([targetUri]))}`
                );

                const link = new vscode.DocumentLink(range, commandUri);
                link.tooltip = `Open ${fileName} in a new tab`;
                links.push(link);
            }
        }
        return links;
    }
}