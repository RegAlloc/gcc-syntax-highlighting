"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GccGraphProvider = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
class GccGraphProvider {
    async openDotFile(editor) {
        if (!editor)
            return;
        // 1. Check for Extension
        const graphvizExt = vscode.extensions.getExtension('tintinweb.graphviz-interactive-preview');
        if (!graphvizExt) {
            const msg = "Graphviz extension not found! Please install 'tintinweb.graphviz-interactive-preview'.";
            const choice = await vscode.window.showErrorMessage(msg, "Install Extension");
            if (choice === "Install Extension") {
                vscode.commands.executeCommand('extension.open', 'tintinweb.graphviz-interactive-preview');
            }
            return;
        }
        const currentUri = editor.document.uri;
        const currentPath = currentUri.fsPath;
        const fileName = path.basename(currentPath);
        // Capture original document info
        const originalColumn = editor.viewColumn || vscode.ViewColumn.One;
        const originalDoc = editor.document;
        // 2. Logic: Look for the .dot file
        const dotPath = currentPath + '.dot';
        if (fs.existsSync(dotPath)) {
            const dotUri = vscode.Uri.file(dotPath);
            try {
                // 3. Open the .dot file (Force Focus so extension sees it)
                const dotDoc = await vscode.workspace.openTextDocument(dotUri);
                await vscode.window.showTextDocument(dotDoc, { viewColumn: originalColumn, preserveFocus: false });
                // 4. Trigger the Preview (Opens in Side Column)
                await vscode.commands.executeCommand('graphviz-interactive-preview.preview.beside');
                // 5. CLEANUP SEQUENCE
                // We delay slightly to let the Preview initialize its data from the
                // file.
                setTimeout(async () => {
                    // Step A: Ensure focus is back on the .dot file (Column 1)
                    // (Just in case the Preview stole focus)
                    await vscode.window.showTextDocument(dotDoc, { viewColumn: originalColumn, preserveFocus: false });
                    // Step B: Close the Active Editor (which is now the .dot file)
                    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                    // Step C: Ensure the Original Dump is visible/focused
                    // (Usually happens automatically when tab closes, but this guarantees
                    // it)
                    await vscode.window.showTextDocument(originalDoc, { viewColumn: originalColumn, preserveFocus: false });
                }, 250); // 250ms is usually enough for the extension to parse the graph
            }
            catch (error) {
                vscode.window.showErrorMessage(`Graphviz Error: ${error.message || error}`);
            }
        }
        else {
            // Smart Error Logic
            const suggestion = this.generateFlagSuggestion(fileName);
            const msg = `Graph file not found! Recompile with: ${suggestion}`;
            const selection = await vscode.window.showErrorMessage(msg, "Copy Flag");
            if (selection === "Copy Flag") {
                await vscode.env.clipboard.writeText(suggestion);
            }
        }
    }
    generateFlagSuggestion(fileName) {
        const regex = /^(.+)\.(\d{3})([tri])\.([^.]+)$/;
        const match = regex.exec(fileName);
        if (!match)
            return "-fdump-[tree|rtl|ipa]-<pass>-graph";
        const typeChar = match[3];
        const passName = match[4];
        let typeStr = "";
        if (typeChar === 'r')
            typeStr = "rtl";
        else if (typeChar === 't')
            typeStr = "tree";
        else if (typeChar === 'i')
            typeStr = "ipa";
        return `-fdump-${typeStr}-${passName}-graph`;
    }
}
exports.GccGraphProvider = GccGraphProvider;
//# sourceMappingURL=graphProvider.js.map