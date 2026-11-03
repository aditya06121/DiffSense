import * as path from 'path';
import * as fs from 'fs';
import {
  ParsedFileAstContext,
  ParsedSymbol,
  ParsedClassContext,
  ParsedImport,
  ConstructorParam,
} from './types';
import { Logger } from '../../core/Logger';

// Dynamic import / require for web-tree-sitter to handle ESM/CJS compatibility in TS-node
const Parser = require('web-tree-sitter');

const IO_DEPENDENCY_PATTERNS = [
  /database|db|repository|repo|client|service|api|fetch|axios|http|prisma|typeorm|mongoose|redis|kafka|sqs|s3|mailer|nodemailer|stripe|auth/i,
];

export class AstParserEngine {
  private static instance: AstParserEngine;
  private initialized = false;
  private parser: any = null;
  private loadedLanguages = new Map<string, any>();
  private logger = Logger.getInstance();

  private constructor() {}

  public static getInstance(): AstParserEngine {
    if (!AstParserEngine.instance) {
      AstParserEngine.instance = new AstParserEngine();
    }
    return AstParserEngine.instance;
  }

  public async init(): Promise<void> {
    if (this.initialized) return;
    try {
      await Parser.init();
      this.parser = new Parser();
      this.initialized = true;
      this.logger.info('[AstParserEngine] Web-Tree-Sitter initialized successfully.');
    } catch (e: any) {
      this.logger.warn(`[AstParserEngine] Failed to initialize web-tree-sitter: ${e.message}`);
    }
  }

  private getWasmPathForExtension(ext: string): { wasmFileName: string; langKey: string } | null {
    switch (ext) {
      case '.ts':
        return { wasmFileName: 'tree-sitter-typescript.wasm', langKey: 'typescript' };
      case '.tsx':
        return { wasmFileName: 'tree-sitter-tsx.wasm', langKey: 'tsx' };
      case '.js':
      case '.jsx':
      case '.mjs':
      case '.cjs':
        return { wasmFileName: 'tree-sitter-javascript.wasm', langKey: 'javascript' };
      case '.py':
        return { wasmFileName: 'tree-sitter-python.wasm', langKey: 'python' };
      case '.go':
        return { wasmFileName: 'tree-sitter-go.wasm', langKey: 'go' };
      case '.java':
        return { wasmFileName: 'tree-sitter-java.wasm', langKey: 'java' };
      case '.rs':
        return { wasmFileName: 'tree-sitter-rust.wasm', langKey: 'rust' };
      default:
        return null;
    }
  }

  private async getLanguage(langKey: string, wasmFileName: string): Promise<any | null> {
    if (this.loadedLanguages.has(langKey)) {
      return this.loadedLanguages.get(langKey);
    }

    const possiblePaths = [
      path.join(process.cwd(), 'node_modules', 'tree-sitter-wasms', 'out', wasmFileName),
      path.join(__dirname, '..', '..', '..', 'node_modules', 'tree-sitter-wasms', 'out', wasmFileName),
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        try {
          const lang = await Parser.Language.load(p);
          this.loadedLanguages.set(langKey, lang);
          return lang;
        } catch (err: any) {
          this.logger.warn(`[AstParserEngine] Could not load wasm ${wasmFileName} from ${p}: ${err.message}`);
        }
      }
    }

    return null;
  }

  public async parseFile(filePath: string, content: string): Promise<ParsedFileAstContext> {
    const ext = path.extname(filePath).toLowerCase();
    const config = this.getWasmPathForExtension(ext);

    if (!this.initialized) {
      await this.init();
    }

    if (!config || !this.parser) {
      return this.fallbackRegexParse(filePath, content, ext);
    }

    const language = await this.getLanguage(config.langKey, config.wasmFileName);
    if (!language) {
      return this.fallbackRegexParse(filePath, content, ext);
    }

    try {
      this.parser.setLanguage(language);
      const tree = this.parser.parse(content);
      const rootNode = tree.rootNode;

      const symbols: ParsedSymbol[] = [];
      const classes: ParsedClassContext[] = [];
      const imports: ParsedImport[] = [];
      const identifiedMockTargets: string[] = [];

      this.traverseNode(rootNode, content, symbols, classes, imports, config.langKey);

      // Determine mock targets based on constructor params & external imports
      for (const cls of classes) {
        for (const p of cls.constructorParams) {
          if (p.isDependency && p.type && !identifiedMockTargets.includes(p.type)) {
            identifiedMockTargets.push(p.type);
          }
        }
      }

      for (const imp of imports) {
        if (imp.isExternal) {
          for (const s of imp.specifiers) {
            if (IO_DEPENDENCY_PATTERNS.some((pat) => pat.test(s) || pat.test(imp.source))) {
              if (!identifiedMockTargets.includes(s)) {
                identifiedMockTargets.push(s);
              }
            }
          }
        }
      }

      return {
        filePath,
        language: config.langKey,
        symbols,
        classes,
        imports,
        identifiedMockTargets,
      };
    } catch (e: any) {
      this.logger.warn(`[AstParserEngine] AST parse failed for ${filePath}: ${e.message}. Using fallback.`);
      return this.fallbackRegexParse(filePath, content, ext);
    }
  }

  private traverseNode(
    node: any,
    content: string,
    symbols: ParsedSymbol[],
    classes: ParsedClassContext[],
    imports: ParsedImport[],
    language: string
  ) {
    if (!node) return;

    // TypeScript / JavaScript Handlers
    if (language === 'typescript' || language === 'tsx' || language === 'javascript') {
      if (node.type === 'import_statement') {
        const imp = this.parseTsImport(node);
        if (imp) imports.push(imp);
      } else if (node.type === 'class_declaration') {
        const classContext = this.parseTsClass(node);
        if (classContext) classes.push(classContext);
      } else if (node.type === 'function_declaration') {
        const symbol = this.parseTsFunction(node);
        if (symbol) symbols.push(symbol);
      } else if (node.type === 'interface_declaration' || node.type === 'type_alias_declaration') {
        const symbol = this.parseTsTypeOrInterface(node);
        if (symbol) symbols.push(symbol);
      }
    } else if (language === 'python') {
      if (node.type === 'import_statement' || node.type === 'import_from_statement') {
        const imp = this.parsePyImport(node);
        if (imp) imports.push(imp);
      } else if (node.type === 'class_definition') {
        const classContext = this.parsePyClass(node);
        if (classContext) classes.push(classContext);
      } else if (node.type === 'function_definition') {
        const symbol = this.parsePyFunction(node);
        if (symbol) symbols.push(symbol);
      }
    }

    for (let i = 0; i < node.childCount; i++) {
      this.traverseNode(node.child(i), content, symbols, classes, imports, language);
    }
  }

  private parseTsImport(node: any): ParsedImport | null {
    const sourceNode = node.children.find((c: any) => c.type === 'string');
    if (!sourceNode) return null;
    const source = sourceNode.text.replace(/['"]/g, '');
    const isExternal = !source.startsWith('.') && !source.startsWith('/');

    const specifiers: string[] = [];
    const clause = node.children.find((c: any) => c.type === 'import_clause');
    if (clause) {
      for (const child of clause.children) {
        if (child.type === 'identifier') {
          specifiers.push(child.text);
        } else if (child.type === 'named_imports') {
          for (const spec of child.children) {
            if (spec.type === 'import_specifier') {
              specifiers.push(spec.text);
            }
          }
        }
      }
    }

    return { source, specifiers, isExternal };
  }

  private parseTsClass(node: any): ParsedClassContext | null {
    let classNode = node;
    const isExported = node.type === 'export_statement' || node.text.startsWith('export');
    if (node.type === 'export_statement') {
      classNode = node.children.find((c: any) => c.type === 'class_declaration') || node;
    }

    const nameNode = classNode.children?.find((c: any) => c.type === 'type_identifier' || c.type === 'identifier');
    const className = nameNode ? nameNode.text : 'AnonymousClass';

    const constructorParams: ConstructorParam[] = [];
    const methods: ParsedSymbol[] = [];
    const properties: Array<{ name: string; type?: string }> = [];

    const bodyNode = classNode.children?.find((c: any) => c.type === 'class_body');
    if (bodyNode) {
      for (const member of bodyNode.children) {
        if (member.type === 'method_definition') {
          const methodNameNode = member.children.find((c: any) => c.type === 'property_identifier');
          const methodName = methodNameNode ? methodNameNode.text : '';

          if (methodName === 'constructor') {
            const paramsNode = member.children.find((c: any) => c.type === 'formal_parameters');
            if (paramsNode) {
              for (const p of paramsNode.children) {
                if (p.type === 'required_parameter' || p.type === 'optional_parameter') {
                  const paramName = p.children.find((c: any) => c.type === 'identifier')?.text || '';
                  const typeAnnotation = p.children.find((c: any) => c.type === 'type_annotation');
                  const typeName = typeAnnotation ? typeAnnotation.text.replace(/^:\s*/, '') : undefined;
                  const isDep = Boolean(
                    typeName &&
                      IO_DEPENDENCY_PATTERNS.some((pat) => pat.test(typeName) || pat.test(paramName))
                  );
                  if (paramName) {
                    constructorParams.push({ name: paramName, type: typeName, isDependency: isDep });
                  }
                }
              }
            }
          } else if (methodName) {
            methods.push({
              name: methodName,
              kind: 'method',
              signature: member.text.split('{')[0].trim(),
              isExported: true,
            });
          }
        } else if (member.type === 'public_field_definition' || member.type === 'field_definition') {
          const propName = member.children.find((c: any) => c.type === 'property_identifier')?.text;
          const typeAnn = member.children.find((c: any) => c.type === 'type_annotation')?.text.replace(/^:\s*/, '');
          if (propName) {
            properties.push({ name: propName, type: typeAnn });
          }
        }
      }
    }

    return {
      className,
      constructorParams,
      methods,
      properties,
      isExported,
    };
  }

  private parseTsFunction(node: any): ParsedSymbol | null {
    const isExported = node.type === 'export_statement' || node.text.startsWith('export');
    const nameNode = node.children?.find((c: any) => c.type === 'identifier');
    if (!nameNode) return null;

    return {
      name: nameNode.text,
      kind: 'function',
      signature: node.text.split('{')[0].trim(),
      isExported,
    };
  }

  private parseTsTypeOrInterface(node: any): ParsedSymbol | null {
    const isExported = node.type === 'export_statement' || node.text.startsWith('export');
    const nameNode = node.children?.find((c: any) => c.type === 'type_identifier' || c.type === 'identifier');
    if (!nameNode) return null;

    return {
      name: nameNode.text,
      kind: node.type === 'interface_declaration' ? 'interface' : 'type_alias',
      signature: node.text.substring(0, 300).trim(),
      isExported,
    };
  }

  private parsePyImport(node: any): ParsedImport | null {
    const text = node.text;
    const isExternal = !text.startsWith('from .') && !text.startsWith('from ..');
    return {
      source: text,
      specifiers: [text],
      isExternal,
    };
  }

  private parsePyClass(node: any): ParsedClassContext | null {
    const nameNode = node.children?.find((c: any) => c.type === 'identifier');
    const className = nameNode ? nameNode.text : 'AnonymousClass';
    const methods: ParsedSymbol[] = [];

    for (const child of node.children) {
      if (child.type === 'block') {
        for (const sub of child.children) {
          if (sub.type === 'function_definition') {
            const funcName = sub.children.find((c: any) => c.type === 'identifier')?.text;
            if (funcName) {
              methods.push({
                name: funcName,
                kind: 'method',
                signature: sub.text.split(':')[0].trim(),
                isExported: !funcName.startsWith('_'),
              });
            }
          }
        }
      }
    }

    return {
      className,
      constructorParams: [],
      methods,
      properties: [],
      isExported: true,
    };
  }

  private parsePyFunction(node: any): ParsedSymbol | null {
    const nameNode = node.children?.find((c: any) => c.type === 'identifier');
    if (!nameNode) return null;
    return {
      name: nameNode.text,
      kind: 'function',
      signature: node.text.split(':')[0].trim(),
      isExported: !nameNode.text.startsWith('_'),
    };
  }

  // Graceful fallback regex parser for Dart / other languages
  private fallbackRegexParse(filePath: string, content: string, ext: string): ParsedFileAstContext {
    const symbols: ParsedSymbol[] = [];
    const classes: ParsedClassContext[] = [];
    const imports: ParsedImport[] = [];
    const identifiedMockTargets: string[] = [];

    // Extract import lines
    const importRegex = /(?:import|from)\s+['"]([^'"]+)['"]/g;
    let impMatch;
    while ((impMatch = importRegex.exec(content)) !== null) {
      const source = impMatch[1];
      const isExternal = !source.startsWith('.') && !source.startsWith('/');
      imports.push({ source, specifiers: [source], isExternal });
    }

    // Extract classes
    const classRegex = /(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?\s*\{/g;
    let classMatch;
    while ((classMatch = classRegex.exec(content)) !== null) {
      const className = classMatch[1];
      classes.push({
        className,
        extendsClass: classMatch[2],
        implementsInterfaces: classMatch[3] ? classMatch[3].split(',').map((s) => s.trim()) : [],
        constructorParams: [],
        methods: [],
        properties: [],
        isExported: classMatch[0].includes('export'),
      });
    }

    // Extract functions
    const funcRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?/g;
    let funcMatch;
    while ((funcMatch = funcRegex.exec(content)) !== null) {
      symbols.push({
        name: funcMatch[1],
        kind: 'function',
        signature: funcMatch[0].trim(),
        returnType: funcMatch[3]?.trim(),
        isExported: funcMatch[0].includes('export'),
      });
    }

    return {
      filePath,
      language: ext.replace(/^\./, ''),
      symbols,
      classes,
      imports,
      identifiedMockTargets,
    };
  }
}
