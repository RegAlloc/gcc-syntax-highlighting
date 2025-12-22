import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class GccMdSymbolProvider implements vscode.DefinitionProvider {
    // Keywords to ignore so we don't jump to 'const_int' or 'match_operand'
    private readonly keywords = new Set(['const_int', 'const_string', 'match_operand', 'match_scratch', 'set', 'list']);

    public async provideDefinition(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Definition | null> {
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) return null;
        
        const word = document.getText(wordRange).replace(/"/g, '');
        if (this.keywords.has(word)) return null;

        const currentDir = path.dirname(document.uri.fsPath);
        const files = fs.readdirSync(currentDir).filter(f => f.endsWith('.md'));
        const sortedFiles = [document.uri.fsPath, ...files.map(f => path.join(currentDir, f)).filter(p => p !== document.uri.fsPath)];

        for (const filePath of sortedFiles) {
            if (!fs.existsSync(filePath)) continue;
            const content = fs.readFileSync(filePath, 'utf8');
            
            /**
             * Fixed Regex:
             * 1. Only matches word as a NAME: (define_... "word" or (define_... word
             * 2. Only matches word as a CONSTANT: (word <value>)
             */
            const pattern = new RegExp(
                `\\(define_(attr|predicate|special_predicate|constraint|register_constraint)\\s+"${word}"` +
                `|\\(define_[a-z]+_(iterator|attr)\\s+${word}\\b` +
                `|\\(\\s*${word}\\s+([0-x0-9a-fA-F-]+)\\s*\\)`, 
                'm'
            );
            
            const match = content.match(pattern);
            if (match && match.index !== undefined) {
                // Manually calculate line and character for the target file
                const lines = content.substring(0, match.index).split('\n');
                const line = lines.length - 1;
                const character = lines[line].length;

                return new vscode.Location(
                    vscode.Uri.file(filePath),
                    new vscode.Range(line, character, line, character + word.length)
                );
            }
        }
        return null;
    }
}