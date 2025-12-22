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
        const word = document.getText(wordRange);

        const result = await this.findDefinitionWithComments(document, word);
        if (!result) return null;

        const markdown = new vscode.MarkdownString();
        
        // 1. Add the documentation (comments) in normal text
        if (result.comments) {
            markdown.appendMarkdown(`**Documentation:**\n\n${result.comments}\n\n---\n`);
        }

        // 2. Add the definition in a themed code block
        markdown.appendCodeblock(result.definition, 'gcc-md'); 
        
        return new vscode.Hover(markdown);
    }

    private async findDefinitionWithComments(document: vscode.TextDocument, name: string) {
        const currentDir = path.dirname(document.uri.fsPath);
        const files = fs.readdirSync(currentDir).filter(f => f.endsWith('.md'));
        const sortedFiles = [document.uri.fsPath, ...files.map(f => path.join(currentDir, f)).filter(p => p !== document.uri.fsPath)];

        for (const filePath of sortedFiles) {
            if (!fs.existsSync(filePath)) continue;
            const content = fs.readFileSync(filePath, 'utf8');
            
            // Regex to find the start of the definition
            const defPattern = new RegExp(`\\(define_[a-z]+_(iterator|attr)\\s+${name}\\b`, 'm');
            const match = content.match(defPattern);
            
            if (match && match.index !== undefined) {
                // A. Extract the definition block (handling simple nesting)
                const textFromDef = content.substring(match.index);
                const definition = this.extractBalancedBlock(textFromDef);

                // B. Extract comments above the definition
                const linesBefore = content.substring(0, match.index).split('\n');
                let comments: string[] = [];
                
                // Walk backwards from the match line to find all ';' lines
                for (let i = linesBefore.length - 1; i >= 0; i--) {
                    const line = linesBefore[i].trim();
                    if (line.startsWith(';') || line === '') {
                        if (line.startsWith(';')) {
                            // Clean up the semicolons for the tooltip
                            comments.unshift(line.replace(/^;+\s*/, ''));
                        }
                    } else {
                        break; // Stop when we hit actual code that isn't our definition
                    }
                }

                return {
                    definition: definition,
                    comments: comments.join('  \n') // Markdown line breaks
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
            if (text[i] === ')') depth--;
            if (depth === 0 && i > 0) {
                endIdx = i + 1;
                break;
            }
        }
        return text.substring(0, endIdx || text.indexOf(')'));
    }
}