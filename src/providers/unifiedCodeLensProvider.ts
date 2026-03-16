/**
 * 统一CodeLens提供器
 * 融合接口跳转和MyBatis跳转的CodeLens显示
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { IndexCacheManager } from '../cache/indexCache';
import { JavaParser, JavaLanguageService } from '../utils';
import { XmlParser } from '../utils/xmlParser';
import { Logger } from '../utils/logger';
import { MyBatisNavigator } from '../navigators/myBatisNavigator';

export class UnifiedCodeLensProvider implements vscode.CodeLensProvider {
  private cache: IndexCacheManager;
  private xmlParser: XmlParser;
  private logger: Logger;
  private myBatisNavigator: MyBatisNavigator;
  private javaLanguageService: JavaLanguageService;

  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;



  constructor() {
    this.cache = IndexCacheManager.getInstance();
    this.xmlParser = XmlParser.getInstance();
    this.logger = Logger.getInstance();
    this.myBatisNavigator = MyBatisNavigator.getInstance();
    this.javaLanguageService = JavaLanguageService.getInstance();
  }

  refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    const filePath = document.uri.fsPath;
    const isJava = filePath.toLowerCase().endsWith('.java');
    const isXml = filePath.toLowerCase().endsWith('.xml');

    if (!isJava && !isXml) {
      return [];
    }

    const config = vscode.workspace.getConfiguration('javaNavigator');
    const enableCodeLens = config.get<boolean>('enableCodeLens', true);
    if (!enableCodeLens) return [];

    try {
      if (isJava) {
        return await this.provideJavaCodeLenses(document);
      } else {
        return await this.provideXmlCodeLenses(document);
      }
    } catch (error) {
      this.logger.error('[UnifiedCodeLensProvider] Error providing CodeLenses:', error);
      return [];
    }
  }

  private async provideJavaCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    const filePath = document.uri.fsPath;
    const content = document.getText();
    const codeLenses: vscode.CodeLens[] = [];

    const javaInfo = JavaParser.parseContent(content, filePath);
    if (!javaInfo.className) return [];

    const config = vscode.workspace.getConfiguration('javaNavigator');
    const enableInterfaceNav = config.get<boolean>('enableInterfaceNavigation', true);
    const enableMyBatisNav = config.get<boolean>('enableMyBatisNavigation', true);

    const symbols = await this.getDocumentSymbols(document);
    const classSymbol = symbols.find(s =>
      s.kind === vscode.SymbolKind.Interface ||
      s.kind === vscode.SymbolKind.Class
    );

    // 获取用户自定义接口列表（过滤系统接口）
    let userInterfaces: string[] = [];
    if (enableInterfaceNav && !javaInfo.isInterface && !javaInfo.isAbstract && !javaInfo.isMapper) {
      // 从文本解析获取所有接口，然后过滤系统接口
      const realInterfaces = javaInfo.interfaces.filter(i => !i.startsWith('__extends:'));
      userInterfaces = await this.filterSystemInterfaces(realInterfaces, document);
      this.logger.debug(`[CodeLens] 过滤后的用户接口:`, userInterfaces);
    }

    // 类级别的CodeLens
    if (classSymbol) {
      const classLine = (classSymbol.selectionRange || classSymbol.range).start.line;

      // 接口/抽象类：跳转到实现
      if (enableInterfaceNav && (javaInfo.isInterface || javaInfo.isAbstract) && !javaInfo.isMapper) {
        const title = javaInfo.isInterface
          ? `$(symbol-interface) 跳转到实现`
          : `$(symbol-class) 跳转到实现`;

        codeLenses.push(this.createCodeLens(
          classLine,
          title,
          'javaNavigator.jumpToImplementation',
          [filePath, javaInfo.className, javaInfo.isAbstract]
        ));
      }

      // MyBatis Mapper：跳转到XML
      if (enableMyBatisNav && javaInfo.isMapper) {
        const mapping = this.cache.getByJavaPath(filePath);
        const hasXml = !!mapping?.xmlPath;

        codeLenses.push(this.createCodeLens(
          classLine,
          hasXml ? `$(file-code) 跳转到XML` : `$(file-code) 查找XML`,
          'javaNavigator.jumpToXml',
          [filePath]
        ));
      }

      // 实现类：跳转到接口
      if (enableInterfaceNav && !javaInfo.isInterface && !javaInfo.isAbstract && !javaInfo.isMapper && userInterfaces.length > 0) {
        codeLenses.push(this.createCodeLens(
          classLine,
          `$(symbol-interface) 跳转到接口`,
          'javaNavigator.jumpToInterfaceFromClass',
          [filePath, javaInfo.className]
        ));
      }
    }

    // 方法级别的CodeLens
    if (enableInterfaceNav || enableMyBatisNav) {
      const methods = this.extractMethodsFromSymbols(symbols, document);

      for (const method of methods) {
        const methodName = method.name.split('(')[0];

        // 普通接口方法：跳转到实现
        if (enableInterfaceNav && javaInfo.isInterface && !javaInfo.isMapper && !method.isDefault) {
          codeLenses.push(this.createCodeLens(
            method.line,
            `$(arrow-right) 跳转到实现`,
            'javaNavigator.jumpToImplementation',
            [filePath, methodName, 'method']
          ));
        }

        // 实现类方法：跳转到接口（只考虑用户自定义接口）
        if (enableInterfaceNav && !javaInfo.isInterface && !javaInfo.isMapper && userInterfaces.length > 0) {
          codeLenses.push(this.createCodeLens(
            method.line,
            `$(arrow-left) 跳转到接口`,
            'javaNavigator.jumpToInterface',
            [filePath, methodName, method.parameters]
          ));
        }

        // Mapper方法：跳转到SQL
        if (enableMyBatisNav && javaInfo.isMapper) {
          const hasSql = await this.checkMethodHasSql(filePath, methodName);

          if (hasSql) {
            codeLenses.push(this.createCodeLens(
              method.line,
              `$(database) 跳转到SQL`,
              'javaNavigator.jumpToXml',
              [filePath, methodName]
            ));
          }
        }
      }
    }

    return codeLenses;
  }

  private async provideXmlCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    const filePath = document.uri.fsPath;
    const codeLenses: vscode.CodeLens[] = [];

    const config = vscode.workspace.getConfiguration('javaNavigator');
    const enableMyBatisNav = config.get<boolean>('enableMyBatisNavigation', true);
    if (!enableMyBatisNav) return [];

    const xmlInfo = await this.xmlParser.parseXmlMapper(filePath);
    if (!xmlInfo) return [];

    const mapping = this.cache.getByXmlPath(filePath) || this.cache.getByNamespace(xmlInfo.namespace);

    const content = document.getText();
    const mapperMatch = content.match(/<mapper/);
    if (mapperMatch) {
      const lines = content.substring(0, mapperMatch.index).split('\n');
      const mapperLine = lines.length - 1;

      codeLenses.push(this.createCodeLens(
        mapperLine,
        mapping ? `$(symbol-class) 跳转到Mapper` : `$(symbol-class) 查找Mapper`,
        'javaNavigator.jumpToMapper',
        [filePath]
      ));
    }

    for (const sql of xmlInfo.sqlElements) {
      if (mapping) {
        codeLenses.push(this.createCodeLens(
          sql.line,
          `$(arrow-left) 跳转到方法`,
          'javaNavigator.jumpToMapper',
          [filePath, sql.id]
        ));
      }
    }

    return codeLenses;
  }

  private createCodeLens(
    line: number,
    title: string,
    command: string,
    args: any[]
  ): vscode.CodeLens {
    const range = new vscode.Range(line, 0, line, 0);
    return new vscode.CodeLens(range, {
      title,
      command,
      arguments: args
    });
  }

  private async getDocumentSymbols(document: vscode.TextDocument): Promise<vscode.DocumentSymbol[]> {
    try {
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        document.uri
      );
      return symbols || [];
    } catch (error) {
      this.logger.error('[UnifiedCodeLensProvider] Failed to get document symbols:', error);
      return [];
    }
  }

  private extractMethodsFromSymbols(
    symbols: vscode.DocumentSymbol[],
    document: vscode.TextDocument
  ): Array<{ name: string; line: number; column: number; isDefault: boolean; parameters: string }> {
    const methods: Array<{ name: string; line: number; column: number; isDefault: boolean; parameters: string }> = [];

    for (const symbol of symbols) {
      if (symbol.kind === vscode.SymbolKind.Method) {
        const position = symbol.selectionRange || symbol.range;
        methods.push({
          name: symbol.name,
          line: position.start.line,
          column: position.start.character,
          isDefault: symbol.name.includes('default') || false,
          parameters: this.extractParamsFromDetail(symbol.detail)
        });
      }

      if (symbol.children) {
        methods.push(...this.extractMethodsFromSymbols(symbol.children, document));
      }
    }

    return methods;
  }

  private extractParamsFromDetail(detail?: string): string {
    if (!detail) return '';
    const match = detail.match(/\(([^)]*)\)/);
    return match ? match[1] : '';
  }

  /**
   * 过滤系统/框架内置接口
   * 使用JavaLanguageService判断是否为系统接口
   * @param interfaces 接口名称列表
   * @param document 当前文档，用于解析接口全限定名
   * @returns 用户自定义接口列表
   */
  private async filterSystemInterfaces(
    interfaces: string[],
    document: vscode.TextDocument
  ): Promise<string[]> {
    const content = document.getText();
    const filtered: string[] = [];

    for (const name of interfaces) {
      const isSystem = await this.javaLanguageService.isSystemInterfaceWithContext(
        name,
        document.uri,
        content
      );
      if (!isSystem) {
        filtered.push(name);
      }
    }

    return filtered;
  }

  private cacheHasSqlForMethod(namespace: string, methodName: string): boolean {
    const mapping = this.cache.getByNamespace(namespace);
    if (!mapping) return false;
    return mapping.methods.has(methodName);
  }

  /**
   * 检查方法是否有对应的SQL
   * 优先从缓存检查，缓存未命中时动态解析XML
   */
  private async checkMethodHasSql(filePath: string, methodName: string): Promise<boolean> {
    // 1. 先检查缓存
    const mapping = this.cache.getByJavaPath(filePath);
    if (mapping) {
      // 检查方法是否在缓存的methods中
      if (mapping.methods.has(methodName)) {
        return true;
      }
      // 如果有xmlPath，检查XML中是否有对应的SQL
      if (mapping.xmlPath) {
        const xmlInfo = await this.xmlParser.parseXmlMapper(mapping.xmlPath);
        if (xmlInfo?.sqlElements.some(s => s.id === methodName)) {
          return true;
        }
      }
    }

    // 2. 缓存未命中，使用MyBatisNavigator查找XML
    const xmlPaths = await this.myBatisNavigator.findXmlForJava(filePath);
    for (const xmlPath of xmlPaths) {
      const xmlInfo = await this.xmlParser.parseXmlMapper(xmlPath);
      if (xmlInfo?.sqlElements.some(s => s.id === methodName)) {
        return true;
      }
    }

    return false;
  }
}
