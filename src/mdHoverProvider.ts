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
        
        const word = document.getText(wordRange).replace(/"/g, '');
        const result = await this.findDefinitionWithComments(document, word);
        if (!result) return null;

        const markdown = new vscode.MarkdownString();
        const title = result.isConstant ? `Constant: **${word}**` : `Definition: **${word}**`;
        markdown.appendMarkdown(`### 💡 GCC ${title}\n`);
        
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
            
            // Try matching Standard Definitions (Iterators/Attrs)
            const defPattern = new RegExp(`\\(define_(attr\\s+"${name}"|[a-z]+_(iterator|attr)\\s+${name}\\b)`, 'm');
            let match = content.match(defPattern);
            
            if (match && match.index !== undefined) {
                return this.packageResult(content, match.index, false);
            }

            // Try matching Constants: (NAME VALUE)
            const constPattern = new RegExp(`\\(\\s*${name}\\s+([0-9a-fAxX]+|[-0-9]+)\\s*\\)`, 'm');
            match = content.match(constPattern);
            if (match && match.index !== undefined) {
                return this.packageResult(content, match.index, true);
            }
        }
        return null;
    }

    private packageResult(content: string, index: number, isConstant: boolean) {
        const definition = isConstant 
            ? content.substring(index).split('\n')[0].trim() // Just the line for constants
            : this.extractBalancedBlock(content.substring(index));

        const linesBefore = content.substring(0, index).split('\n');
        let comments: string[] = [];
        for (let i = linesBefore.length - 1; i >= 0; i--) {
            const line = linesBefore[i].trim();
            if (line.startsWith(';') || line === '') {
                if (line.startsWith(';')) comments.unshift(line.replace(/^;+\s*/, ''));
            } else break;
        }

        return { definition, comments: comments.join('  \n'), isConstant };
    }

    private extractBalancedBlock(text: string): string {
        let depth = 0, endIdx = 0;
        for (let i = 0; i < text.length; i++) {
            if (text[i] === '(') depth++;
            else if (text[i] === ')') depth--;
            if (depth === 0 && i > 0) { endIdx = i + 1; break; }
        }
        return text.substring(0, endIdx || text.indexOf(')'));
    }
}