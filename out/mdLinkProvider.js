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
exports.GCCMdLinkProvider = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class GCCMdLinkProvider {
    provideDocumentLinks(document) {
        const links = [];
        const text = document.getText();
        const includeRegex = /\(include\s+"([^"]+)"\)/g;
        let match;
        while ((match = includeRegex.exec(text)) !== null) {
            const fileName = match[1];
            // Calculate exact position of the filename for the underline
            const startIdx = match.index + match[0].indexOf(fileName);
            const range = new vscode.Range(document.positionAt(startIdx), document.positionAt(startIdx + fileName.length));
            // Resolve the path relative to the current file's directory
            const currentDir = path.dirname(document.uri.fsPath);
            const filePath = path.resolve(currentDir, fileName);
            if (fs.existsSync(filePath)) {
                const targetUri = vscode.Uri.file(filePath);
                // Use the custom command we registered in extension.ts
                // This ensures every click opens a new, permanent tab
                const commandUri = vscode.Uri.parse(`command:gcc-md.openFilePermanent?${encodeURIComponent(JSON.stringify([targetUri]))}`);
                const link = new vscode.DocumentLink(range, commandUri);
                link.tooltip = `Follow include: ${filePath}`;
                links.push(link);
            }
        }
        return links;
    }
}
exports.GCCMdLinkProvider = GCCMdLinkProvider;
//# sourceMappingURL=mdLinkProvider.js.map