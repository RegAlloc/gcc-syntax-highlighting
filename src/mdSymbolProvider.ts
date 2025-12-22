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
        
        const word = document.getText(wordRange).replace(/"/g, '');

        const currentDir = path.dirname(document.uri.fsPath);
        const files = fs.readdirSync(currentDir).filter(f => f.endsWith('.md'));
        
        const sortedFiles = [
            document.uri.fsPath, 
            ...files.map(f => path.join(currentDir, f)).filter(p => p !== document.uri.fsPath)
        ];

        for (const filePath of sortedFiles) {
            if (!fs.existsSync(filePath)) continue;
            const content = fs.readFileSync(filePath, 'utf8');
            
            // Regex handles: 
            // 1. Attributes: (define_attr "type"
            // 2. Iterators: (define_mode_iterator INT1
            // 3. Constants: (FIRST_ALTIVEC_REGNO 64)
            const pattern = new RegExp(
                `\\(define_(attr\\s+"${word}"|[a-z]+_(iterator|attr)\\s+${word}\\b)|\\(\\s*${word}\\s+([0-9a-fAxX]+|[-0-9]+)\\s*\\)`, 
                'm'
            );
            
            const match = content.match(pattern);

            if (match && match.index !== undefined) {
                const textBefore = content.substring(0, match.index);
                const lines = textBefore.split('\n');
                return new vscode.Location(
                    vscode.Uri.file(filePath),
                    new vscode.Position(lines.length - 1, lines[lines.length - 1].length)
                );
            }
        }
        return null;
    }
}