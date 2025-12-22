import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class GccMdReferenceProvider implements vscode.ReferenceProvider {
    public async provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext
    ): Promise<vscode.Location[] | null> {
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) return null;
        const word = document.getText(wordRange).replace(/"/g, '');

        const locations: vscode.Location[] = [];
        const currentDir = path.dirname(document.uri.fsPath);
        const files = fs.readdirSync(currentDir).filter(f => f.endsWith('.md'));

        for (const file of files) {
            const filePath = path.join(currentDir, file);
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');

            lines.forEach((lineText, lineIdx) => {
                // Find all occurrences of the word in this line
                let startPos = 0;
                while ((startPos = lineText.indexOf(word, startPos)) !== -1) {
                    // Ensure it's a whole word match
                    const endPos = startPos + word.length;
                    const before = lineText[startPos - 1] || '';
                    const after = lineText[endPos] || '';
                    
                    if (!before.match(/[a-zA-Z0-9_]/) && !after.match(/[a-zA-Z0-9_]/)) {
                        locations.push(new vscode.Location(
                            vscode.Uri.file(filePath),
                            new vscode.Range(lineIdx, startPos, lineIdx, endPos)
                        ));
                    }
                    startPos = endPos;
                }
            });
        }
        return locations;
    }
}