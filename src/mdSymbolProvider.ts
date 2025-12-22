import * as vscode from 'vscode';
import { GccMdCache } from './mdCache';

export class GccMdSymbolProvider implements vscode.DefinitionProvider {
    constructor(private cache: GccMdCache) {}

    public provideDefinition(document: vscode.TextDocument, position: vscode.Position): vscode.Definition | null {
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) return null;
        
        const word = document.getText(wordRange).replace(/"/g, '');
        const symbol = this.cache.getSymbol(word);

        if (symbol) {
            return new vscode.Location(symbol.uri, new vscode.Position(symbol.line, symbol.character));
        }
        return null;
    }
}