import * as vscode from 'vscode';
import * as fs from 'fs';
import { GccMdCache } from './mdCache';

export class GccMdReferenceProvider implements vscode.ReferenceProvider {
    constructor(private cache: GccMdCache) {}

    public async provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<vscode.Location[] | null> {
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) return null;
        
        const word = document.getText(wordRange).replace(/"/g, '');
        const filesToScan = this.cache.getFilesWithWord(word);
        const locations: vscode.Location[] = [];

        // Scan only relevant files in parallel
        await Promise.all(filesToScan.map(async (filePath) => {
            const content = await fs.promises.readFile(filePath, 'utf8');
            const lines = content.split('\n');
            
            lines.forEach((lineText, lineIdx) => {
                let startPos = 0;
                while ((startPos = lineText.indexOf(word, startPos)) !== -1) {
                    const endPos = startPos + word.length;
                    
                    // Strict word boundary check
                    const before = lineText[startPos - 1] || ' ';
                    const after = lineText[endPos] || ' ';
                    if (!/[a-zA-Z0-9_]/.test(before) && !/[a-zA-Z0-9_]/.test(after)) {
                        locations.push(new vscode.Location(
                            vscode.Uri.file(filePath),
                            new vscode.Range(lineIdx, startPos, lineIdx, endPos)
                        ));
                    }
                    startPos = endPos;
                }
            });
        }));

        return locations;
    }
}