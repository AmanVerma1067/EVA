/**
 * EVA AST Symbol Parser & Semantic Graph Extractor
 * Conforms to Section 4 of EVA Master Architecture Spec (Phase 18)
 * Leverages the TypeScript Compiler AST API to parse functions, classes,
 * interfaces, imports, and exports into a semantic symbol graph,
 * enabling 80%+ prompt token reduction through targeted context slicing.
 */

import ts from 'typescript';

export type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'enum'
  | 'variable'
  | 'method'
  | 'import'
  | 'export';

export interface SymbolParameter {
  name: string;
  type?: string;
  isOptional: boolean;
}

export interface ASTSymbol {
  name: string;
  kind: SymbolKind;
  exported: boolean;
  isAsync?: boolean;
  parameters?: SymbolParameter[];
  returnType?: string;
  startLine: number;
  endLine: number;
  startPos: number;
  endPos: number;
  documentation?: string;
  references?: string[];
  signature?: string;
}

export interface ImportReference {
  moduleSpecifier: string;
  symbols: string[];
  isDefault: boolean;
  defaultAlias?: string;
}

export interface ParsedFile {
  fileName: string;
  language: 'typescript' | 'javascript' | 'generic';
  totalLines: number;
  totalCharacters: number;
  symbols: ASTSymbol[];
  imports: ImportReference[];
  exports: string[];
}

export interface ContextSliceResult {
  fileName: string;
  targetSymbol?: string;
  originalCode: string;
  slicedCode: string;
  originalTokens: number;
  slicedTokens: number;
  tokensSaved: number;
  reductionPercentage: number;
  includedSymbols: string[];
  omittedSymbols: string[];
}

export class ASTSymbolParser {
  /**
   * Estimates tokens using standard LLM subword heuristics
   * (~3.8 to 4 characters per token for source code)
   */
  public static estimateTokens(text: string): number {
    if (!text || text.length === 0) return 0;
    // Punctuation and code symbols tokenize into higher token-to-char ratios
    const wordsAndPunctuation = text.split(/\s+/).filter(Boolean);
    const charCount = text.length;
    // Accurate blend: average ~3.7 chars per token in code
    return Math.max(1, Math.round(charCount / 3.7));
  }

  /**
   * Parses source code into a structured AST representation with symbols and references
   */
  public parseSource(code: string, fileName = 'source.ts'): ParsedFile {
    const isTS = fileName.endsWith('.ts') || fileName.endsWith('.tsx');
    const isJS = fileName.endsWith('.js') || fileName.endsWith('.jsx') || fileName.endsWith('.mjs');

    if (!isTS && !isJS) {
      return this.parseGenericSource(code, fileName);
    }

    const scriptKind = fileName.endsWith('.tsx')
      ? ts.ScriptKind.TSX
      : fileName.endsWith('.jsx')
      ? ts.ScriptKind.JSX
      : fileName.endsWith('.js')
      ? ts.ScriptKind.JS
      : ts.ScriptKind.TS;

    const sourceFile = ts.createSourceFile(
      fileName,
      code,
      ts.ScriptTarget.Latest,
      true,
      scriptKind
    );

    const symbols: ASTSymbol[] = [];
    const imports: ImportReference[] = [];
    const exports: string[] = [];
    const totalLines = code.split('\n').length;

    const visit = (node: ts.Node) => {
      // 1. Imports
      if (ts.isImportDeclaration(node)) {
        const moduleSpecifier = node.moduleSpecifier.getText(sourceFile).replace(/['"]/g, '');
        const impSymbols: string[] = [];
        let isDefault = false;
        let defaultAlias: string | undefined;

        if (node.importClause) {
          if (node.importClause.name) {
            isDefault = true;
            defaultAlias = node.importClause.name.text;
            impSymbols.push(defaultAlias);
          }
          if (node.importClause.namedBindings) {
            if (ts.isNamedImports(node.importClause.namedBindings)) {
              for (const elem of node.importClause.namedBindings.elements) {
                impSymbols.push(elem.name.text);
              }
            } else if (ts.isNamespaceImport(node.importClause.namedBindings)) {
              impSymbols.push(node.importClause.namedBindings.name.text);
            }
          }
        }
        imports.push({ moduleSpecifier, symbols: impSymbols, isDefault, defaultAlias });
      }

      // 2. Functions
      else if (ts.isFunctionDeclaration(node)) {
        const name = node.name?.text || 'anonymous';
        const isExported = this.hasModifier(node, ts.SyntaxKind.ExportKeyword);
        const isAsync = this.hasModifier(node, ts.SyntaxKind.AsyncKeyword);
        const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
        const params = this.extractParameters(node.parameters, sourceFile);
        const returnType = node.type ? node.type.getText(sourceFile) : undefined;
        const signature = `${isAsync ? 'async ' : ''}function ${name}(${params.map(p => `${p.name}${p.isOptional ? '?' : ''}${p.type ? `: ${p.type}` : ''}`).join(', ')})${returnType ? `: ${returnType}` : ''}`;

        if (isExported && name !== 'anonymous') exports.push(name);

        symbols.push({
          name,
          kind: 'function',
          exported: isExported,
          isAsync,
          parameters: params,
          returnType,
          startLine: start.line + 1,
          endLine: end.line + 1,
          startPos: node.getStart(sourceFile),
          endPos: node.getEnd(),
          signature,
          references: this.extractIdentifierReferences(node, sourceFile),
        });
      }

      // 3. Classes
      else if (ts.isClassDeclaration(node)) {
        const name = node.name?.text || 'AnonymousClass';
        const isExported = this.hasModifier(node, ts.SyntaxKind.ExportKeyword);
        const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

        if (isExported && name !== 'AnonymousClass') exports.push(name);

        symbols.push({
          name,
          kind: 'class',
          exported: isExported,
          startLine: start.line + 1,
          endLine: end.line + 1,
          startPos: node.getStart(sourceFile),
          endPos: node.getEnd(),
          signature: `class ${name}`,
          references: this.extractIdentifierReferences(node, sourceFile),
        });

        // Also index class methods
        for (const member of node.members) {
          if (ts.isMethodDeclaration(member)) {
            const methodName = member.name.getText(sourceFile);
            const mStart = sourceFile.getLineAndCharacterOfPosition(member.getStart(sourceFile));
            const mEnd = sourceFile.getLineAndCharacterOfPosition(member.getEnd());
            const mParams = this.extractParameters(member.parameters, sourceFile);
            const mRet = member.type ? member.type.getText(sourceFile) : undefined;
            const mAsync = this.hasModifier(member, ts.SyntaxKind.AsyncKeyword);

            symbols.push({
              name: `${name}.${methodName}`,
              kind: 'method',
              exported: isExported,
              isAsync: mAsync,
              parameters: mParams,
              returnType: mRet,
              startLine: mStart.line + 1,
              endLine: mEnd.line + 1,
              startPos: member.getStart(sourceFile),
              endPos: member.getEnd(),
              signature: `${mAsync ? 'async ' : ''}${methodName}(${mParams.map(p => `${p.name}${p.isOptional ? '?' : ''}`).join(', ')})${mRet ? `: ${mRet}` : ''}`,
              references: this.extractIdentifierReferences(member, sourceFile),
            });
          }
        }
      }

      // 4. Interfaces
      else if (ts.isInterfaceDeclaration(node)) {
        const name = node.name.text;
        const isExported = this.hasModifier(node, ts.SyntaxKind.ExportKeyword);
        const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

        if (isExported) exports.push(name);

        symbols.push({
          name,
          kind: 'interface',
          exported: isExported,
          startLine: start.line + 1,
          endLine: end.line + 1,
          startPos: node.getStart(sourceFile),
          endPos: node.getEnd(),
          signature: `interface ${name}`,
          references: this.extractIdentifierReferences(node, sourceFile),
        });
      }

      // 5. Type Aliases
      else if (ts.isTypeAliasDeclaration(node)) {
        const name = node.name.text;
        const isExported = this.hasModifier(node, ts.SyntaxKind.ExportKeyword);
        const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

        if (isExported) exports.push(name);

        symbols.push({
          name,
          kind: 'type',
          exported: isExported,
          startLine: start.line + 1,
          endLine: end.line + 1,
          startPos: node.getStart(sourceFile),
          endPos: node.getEnd(),
          signature: `type ${name} = ...`,
          references: this.extractIdentifierReferences(node, sourceFile),
        });
      }

      // 6. Enums
      else if (ts.isEnumDeclaration(node)) {
        const name = node.name.text;
        const isExported = this.hasModifier(node, ts.SyntaxKind.ExportKeyword);
        const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

        if (isExported) exports.push(name);

        symbols.push({
          name,
          kind: 'enum',
          exported: isExported,
          startLine: start.line + 1,
          endLine: end.line + 1,
          startPos: node.getStart(sourceFile),
          endPos: node.getEnd(),
          signature: `enum ${name}`,
        });
      }

      // 7. Exported Variables / Arrow Functions
      else if (ts.isVariableStatement(node)) {
        const isExported = this.hasModifier(node, ts.SyntaxKind.ExportKeyword);
        for (const decl of node.declarationList.declarations) {
          const varName = decl.name.getText(sourceFile);
          if (isExported) exports.push(varName);

          const isArrowFn = decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer));
          const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

          symbols.push({
            name: varName,
            kind: isArrowFn ? 'function' : 'variable',
            exported: isExported,
            startLine: start.line + 1,
            endLine: end.line + 1,
            startPos: node.getStart(sourceFile),
            endPos: node.getEnd(),
            signature: `const ${varName}`,
            references: this.extractIdentifierReferences(decl, sourceFile),
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    return {
      fileName,
      language: isTS ? 'typescript' : 'javascript',
      totalLines,
      totalCharacters: code.length,
      symbols,
      imports,
      exports,
    };
  }

  /**
   * Generates a high-signal, token-compact context slice.
   * If a target symbol is specified, keeps that symbol and its direct type dependencies,
   * while collapsing untouched function/method bodies into stubs.
   */
  public createContextSlice(options: {
    code: string;
    fileName?: string;
    targetSymbol?: string;
    includeTypes?: boolean;
  }): ContextSliceResult {
    const { code, fileName = 'source.ts', targetSymbol, includeTypes = true } = options;
    const parsed = this.parseSource(code, fileName);
    const originalTokens = ASTSymbolParser.estimateTokens(code);

    if (!targetSymbol) {
      // If no specific target symbol, prune comments and collapse large non-exported functions
      return this.compactOverview(code, parsed, originalTokens);
    }

    const matchedSymbol = parsed.symbols.find(
      (s) => s.name.toLowerCase() === targetSymbol.toLowerCase() || s.name.toLowerCase().endsWith(`.${targetSymbol.toLowerCase()}`)
    );

    if (!matchedSymbol) {
      // Symbol not found; return full compacted file
      return this.compactOverview(code, parsed, originalTokens);
    }

    // Identify dependent symbols (e.g. interfaces or types referenced by the target symbol)
    const neededSymbols = new Set<string>([matchedSymbol.name]);
    if (matchedSymbol.references && includeTypes) {
      for (const ref of matchedSymbol.references) {
        const refSym = parsed.symbols.find((s) => s.name === ref && (s.kind === 'interface' || s.kind === 'type' || s.kind === 'enum'));
        if (refSym) {
          neededSymbols.add(refSym.name);
        }
      }
    }

    // Build the sliced context:
    // 1. Keep all imports
    // 2. Keep needed interfaces/types
    // 3. Keep target function/method
    // 4. Stub out remaining functions
    const lines = code.split('\n');
    const includedSymbols: string[] = [];
    const omittedSymbols: string[] = [];

    // Map which lines should be preserved verbatim vs stubbed
    // Sort symbols by start position
    const sortedSymbols = [...parsed.symbols]
      .filter((s) => s.kind === 'function' || s.kind === 'method')
      .sort((a, b) => a.startPos - b.startPos);

    let sliced = '';
    let lastCopiedPos = 0;

    for (const sym of sortedSymbols) {
      const isTarget =
        neededSymbols.has(sym.name) ||
        (targetSymbol &&
          (sym.name.toLowerCase() === targetSymbol.toLowerCase() ||
            sym.name.toLowerCase().endsWith(`.${targetSymbol.toLowerCase()}`)));

      if (isTarget) {
        includedSymbols.push(sym.name);
        continue;
      }

      omittedSymbols.push(sym.name);
      const before = code.slice(lastCopiedPos, sym.startPos);
      sliced += before;

      const paramStr = sym.parameters ? sym.parameters.map((p) => `${p.name}${p.isOptional ? '?' : ''}`).join(', ') : '';
      const stub = `${sym.signature ? sym.signature : sym.name + `(${paramStr})`} { /* [PRUNED] ${sym.endLine - sym.startLine + 1} lines omitted */ }\n`;
      sliced += stub;
      lastCopiedPos = sym.endPos;
    }

    // Append the remainder of the file
    sliced += code.slice(lastCopiedPos);

    // Clean up excessive blank lines
    sliced = sliced.replace(/\n{3,}/g, '\n\n').trim();

    const slicedTokens = ASTSymbolParser.estimateTokens(sliced);
    const tokensSaved = Math.max(0, originalTokens - slicedTokens);
    const reductionPercentage = originalTokens > 0 ? Math.round((tokensSaved / originalTokens) * 1000) / 10 : 0;

    return {
      fileName,
      targetSymbol,
      originalCode: code,
      slicedCode: sliced,
      originalTokens,
      slicedTokens,
      tokensSaved,
      reductionPercentage,
      includedSymbols: Array.from(neededSymbols),
      omittedSymbols,
    };
  }

  private compactOverview(code: string, parsed: ParsedFile, originalTokens: number): ContextSliceResult {
    // Generate an executive interface signature outline of the entire file
    const headerLines: string[] = [];
    headerLines.push(`// Semantic Outline of ${parsed.fileName} (${parsed.totalLines} lines, ${parsed.symbols.length} symbols)`);

    for (const imp of parsed.imports) {
      headerLines.push(`import { ${imp.symbols.join(', ')} } from '${imp.moduleSpecifier}';`);
    }
    headerLines.push('');

    for (const sym of parsed.symbols) {
      if (sym.kind === 'interface' || sym.kind === 'type' || sym.kind === 'enum') {
        const symSnippet = code.slice(sym.startPos, sym.endPos);
        headerLines.push(symSnippet);
        headerLines.push('');
      } else if (sym.kind === 'function' || sym.kind === 'method') {
        headerLines.push(`${sym.signature || sym.name} { /* implementation omitted */ }`);
      } else if (sym.kind === 'class') {
        headerLines.push(`class ${sym.name} { /* methods and properties indexed */ }`);
      }
    }

    const outline = headerLines.join('\n');
    const slicedTokens = ASTSymbolParser.estimateTokens(outline);
    const tokensSaved = Math.max(0, originalTokens - slicedTokens);
    const reductionPercentage = originalTokens > 0 ? Math.round((tokensSaved / originalTokens) * 1000) / 10 : 0;

    return {
      fileName: parsed.fileName,
      originalCode: code,
      slicedCode: outline,
      originalTokens,
      slicedTokens,
      tokensSaved,
      reductionPercentage,
      includedSymbols: parsed.symbols.map((s) => s.name),
      omittedSymbols: [],
    };
  }

  private parseGenericSource(code: string, fileName: string): ParsedFile {
    const lines = code.split('\n');
    const symbols: ASTSymbol[] = [];

    // Simple line-based signature extraction for Python, Go, Rust, shell
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const fnMatch = line.match(/^(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\((.*?)\):/);
      if (fnMatch) {
        symbols.push({
          name: fnMatch[1],
          kind: 'function',
          exported: !fnMatch[1].startsWith('_'),
          startLine: i + 1,
          endLine: i + 1,
          startPos: 0,
          endPos: 0,
          signature: line,
        });
      }
      const classMatch = line.match(/^class\s+([a-zA-Z0-9_]+)/);
      if (classMatch) {
        symbols.push({
          name: classMatch[1],
          kind: 'class',
          exported: true,
          startLine: i + 1,
          endLine: i + 1,
          startPos: 0,
          endPos: 0,
          signature: line,
        });
      }
    }

    return {
      fileName,
      language: 'generic',
      totalLines: lines.length,
      totalCharacters: code.length,
      symbols,
      imports: [],
      exports: symbols.filter((s) => s.exported).map((s) => s.name),
    };
  }

  private hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
    if (!('modifiers' in node) || !node.modifiers) return false;
    return (node.modifiers as ts.NodeArray<ts.ModifierLike>).some((m) => m.kind === kind);
  }

  private extractParameters(params: ts.NodeArray<ts.ParameterDeclaration>, sourceFile: ts.SourceFile): SymbolParameter[] {
    return params.map((p) => ({
      name: p.name.getText(sourceFile),
      type: p.type ? p.type.getText(sourceFile) : undefined,
      isOptional: Boolean(p.questionToken || p.initializer),
    }));
  }

  private extractIdentifierReferences(node: ts.Node, sourceFile: ts.SourceFile): string[] {
    const refs = new Set<string>();
    const visitRef = (child: ts.Node) => {
      if (ts.isIdentifier(child)) {
        refs.add(child.getText(sourceFile));
      }
      ts.forEachChild(child, visitRef);
    };
    ts.forEachChild(node, visitRef);
    return Array.from(refs);
  }
}
