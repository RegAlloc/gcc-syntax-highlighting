import * as vscode from 'vscode';
import { GCCMdLinkProvider } from './linkProvider';
import { GccMdSymbolProvider } from './mdSymbolProvider';
import { GccMdHoverProvider } from './mdHoverProvider'; // Import the new provider

export function activate(context: vscode.ExtensionContext) {
    const selector: vscode.DocumentSelector = { scheme: 'file', language: 'gcc-md' };

    // 1. Register the custom command
    const openCommand = vscode.commands.registerCommand('gcc-md.openFilePermanent', (uri: vscode.Uri) => {
        vscode.window.showTextDocument(uri, {
            preview: false,
            preserveFocus: false
        });
    });
    context.subscriptions.push(openCommand);

    // 2. Register the providers
    context.subscriptions.push(
        vscode.languages.registerDocumentLinkProvider(selector, new GCCMdLinkProvider())
    );
    // New: Register the MD Iterator/Attribute jumper
    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(selector, new GccMdSymbolProvider())
    );
    // New: Register the Hover Provider
    context.subscriptions.push(
        vscode.languages.registerHoverProvider(selector, new GccMdHoverProvider())
    );
}
export function deactivate() {}