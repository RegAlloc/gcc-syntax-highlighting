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
        
        // Clean the word: remove quotes if the user clicked "type" inside "set_attr"
        const word = document.getText(wordRange).replace(/"/g, '');

        const currentDir = path.dirname(document.uri.fsPath);
        const files = fs.readdirSync(currentDir).filter(f => f.endsWith('.md'));
        
        // Prioritize current file, then search all .md files in the backend directory
        const sortedFiles = [
            document.uri.fsPath, 
            ...files.map(f => path.join(currentDir, f)).filter(p => p !== document.uri.fsPath)
        ];

        for (const filePath of sortedFiles) {
            if (!fs.existsSync(filePath)) continue;
            const content = fs.readFileSync(filePath, 'utf8');
            
            /**
             * Regex Explanation:
             * 1. \\(define_attr\\s+"${word}" -> Matches (define_attr "type"
             * 2. \\(define_[a-z]+_(iterator|attr)\\s+${word}\\b -> Matches (define_mode_iterator INT1
             */
            const pattern = new RegExp(`\\(define_(attr\\s+"${word}"|[a-z]+_(iterator|attr)\\s+${word}\\b)`, 'm');
            const match = content.match(pattern);

            if (match && match.index !== undefined) {
                const textBefore = content.substring(0, match.index);
                const lines = textBefore.split('\n');
                const lineNum = lines.length - 1;
                const charNum = lines[lineNum].length;

                return new vscode.Location(
                    vscode.Uri.file(filePath),
                    new vscode.Position(lineNum, charNum)
                );
            }
        }
        return null;
    }
}