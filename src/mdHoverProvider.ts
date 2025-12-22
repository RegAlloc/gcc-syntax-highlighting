import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class GccMdHoverProvider implements vscode.HoverProvider {
    public async provideHover(
        document: vscode.TextDocument, 
        position: vscode.Position
    ): Promise<vscode.Hover | null> {
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) return null;
        
        // Clean the word: remove quotes if the user hovers over "type"
        const word = document.getText(wordRange).replace(/"/g, '');

        const result = await this.findDefinitionWithComments(document, word);
        if (!result) return null;

        const markdown = new vscode.MarkdownString();
        markdown.appendMarkdown(`#### 💡 Documentation: **${word}**\n`);
        
        if (result.comments) {
            markdown.appendMarkdown(`${result.comments}\n\n---\n`);
        }
        
        markdown.appendCodeblock(result.definition, 'gcc-md');
        
        return new vscode.Hover(markdown);
    }

    private async findDefinitionWithComments(document: vscode.TextDocument, name: string) {
        const currentDir = path.dirname(document.uri.fsPath);
        const files = fs.readdirSync(currentDir).filter(f => f.endsWith('.md'));
        const sortedFiles = [
            document.uri.fsPath, 
            ...files.map(f => path.join(currentDir, f)).filter(p => p !== document.uri.fsPath)
        ];

        for (const filePath of sortedFiles) {
            if (!fs.existsSync(filePath)) continue;
            const content = fs.readFileSync(filePath, 'utf8');
            
            const defPattern = new RegExp(`\\(define_(attr\\s+"${name}"|[a-z]+_(iterator|attr)\\s+${name}\\b)`, 'm');
            const match = content.match(defPattern);
            
            if (match && match.index !== undefined) {
                // Extract the full block by balancing parentheses
                const definition = this.extractBalancedBlock(content.substring(match.index));
                
                // Extract comments directly above the definition
                const linesBefore = content.substring(0, match.index).split('\n');
                let comments: string[] = [];
                for (let i = linesBefore.length - 1; i >= 0; i--) {
                    const line = linesBefore[i].trim();
                    // Keep walking up as long as we see comments or empty lines
                    if (line.startsWith(';') || line === '') {
                        if (line.startsWith(';')) {
                            comments.unshift(line.replace(/^;+\s*/, ''));
                        }
                    } else {
                        break;
                    }
                }

                return {
                    definition: definition,
                    comments: comments.join('  \n')
                };
            }
        }
        return null;
    }

    private extractBalancedBlock(text: string): string {
        let depth = 0;
        let endIdx = 0;
        for (let i = 0; i < text.length; i++) {
            if (text[i] === '(') depth++;
            else if (text[i] === ')') depth--;
            
            if (depth === 0 && i > 0) {
                endIdx = i + 1;
                break;
            }
        }
        return text.substring(0, endIdx || text.indexOf(')'));
    }
}