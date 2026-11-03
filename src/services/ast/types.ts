export type SymbolKind = 'class' | 'function' | 'method' | 'interface' | 'type_alias' | 'variable';

export interface ParameterInfo {
  name: string;
  type?: string;
  isOptional?: boolean;
  defaultValue?: string;
}

export interface ParsedSymbol {
  name: string;
  kind: SymbolKind;
  signature: string;
  parameters?: ParameterInfo[];
  returnType?: string;
  isExported: boolean;
}

export interface ConstructorParam {
  name: string;
  type?: string;
  isDependency: boolean;
}

export interface ParsedClassContext {
  className: string;
  extendsClass?: string;
  implementsInterfaces?: string[];
  constructorParams: ConstructorParam[];
  methods: ParsedSymbol[];
  properties: Array<{ name: string; type?: string }>;
  isExported: boolean;
}

export interface ParsedImport {
  source: string;
  specifiers: string[];
  isExternal: boolean; // e.g. third party or external I/O lib
}

export interface ParsedFileAstContext {
  filePath: string;
  language: string;
  symbols: ParsedSymbol[];
  classes: ParsedClassContext[];
  imports: ParsedImport[];
  identifiedMockTargets: string[];
}

export interface SiblingTestPattern {
  testFilePath: string;
  framework: 'vitest' | 'jest' | 'mocha' | 'pytest' | 'flutter' | 'unknown';
  usesGlobals: boolean;
  mockSnippets: string[];
  fixtureSnippets: string[];
}

export interface AstEnrichedDiffContext {
  targetFilesContext: ParsedFileAstContext[];
  siblingPatterns: SiblingTestPattern[];
  formattedPromptBlock: string;
}
