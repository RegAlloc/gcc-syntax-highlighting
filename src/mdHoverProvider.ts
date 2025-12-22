import * as vscode from 'vscode';
import { GccMdCache } from './mdCache';

export class GccMdHoverProvider implements vscode.HoverProvider {
    constructor(private cache: GccMdCache) {}

    public provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | null {
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) return null;
        
        const word = document.getText(wordRange).replace(/"/g, '');
        const symbol = this.cache.getSymbol(word);

        if (symbol) {
            const markdown = new vscode.MarkdownString();
            markdown.appendMarkdown(`### 💡 GCC MD: **${word}**\n`);
            if (symbol.comments) markdown.appendMarkdown(`${symbol.comments}\n\n---\n`);
            markdown.appendCodeblock(symbol.definition, 'gcc-md');
            return new vscode.Hover(markdown);
        }
        return null;
    }
}