/**
 * Java文件解析器
 * 解析Java文件的类、方法、接口实现关系等
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import { JavaParseResult, JavaMethod } from '../types';
import { JavaLanguageService } from './javaLanguageService';

// Java关键字集合
const JAVA_KEYWORDS = new Set([
  'if', 'else', 'for', 'while', 'do', 'switch', 'try', 'catch', 'finally',
  'return', 'throw', 'new', 'case', 'break', 'continue', 'assert',
  'super', 'this', 'instanceof'
]);

export class JavaParser {
  /**
   * 解析Java文件内容
   */
  static parseContent(content: string, filePath?: string): JavaParseResult {
    const lines = content.split('\n');
    
    // 解析包名
    const packageName = this.extractPackageName(content);
    
    // 解析类信息
    const classInfo = this.extractClassInfo(content);
    
    // 检查是否是MyBatis Mapper
    const isMapper = this.isMyBatisMapper(content, filePath);
    
    // 提取方法
    const methods = this.extractMethods(content);
    
    // 提取实现的接口
    const interfaces = this.extractImplementedInterfaces(content);
    
    // 提取父类
    const superClass = this.extractSuperClass(content);

    return {
      packageName,
      className: classInfo.name,
      isInterface: classInfo.isInterface,
      isAbstract: classInfo.isAbstract,
      isMapper,
      methods,
      interfaces,
      superClass
    };
  }

  /**
   * 提取包名
   */
  static extractPackageName(content: string): string {
    const match = content.match(/package\s+([^;]+);/);
    return match ? match[1] : '';
  }

  /**
   * 提取类信息
   */
  static extractClassInfo(content: string): { name: string; isInterface: boolean; isAbstract: boolean } {
    // 匹配接口
    const interfaceMatch = content.match(/\b(?:public\s+)?interface\s+(\w+)/);
    if (interfaceMatch) {
      return { name: interfaceMatch[1], isInterface: true, isAbstract: false };
    }

    // 匹配抽象类
    const abstractMatch = content.match(/\b(?:public\s+)?abstract\s+class\s+(\w+)/);
    if (abstractMatch) {
      return { name: abstractMatch[1], isInterface: false, isAbstract: true };
    }

    // 匹配普通类
    const classMatch = content.match(/\b(?:public\s+|private\s+|protected\s+)?(?:final\s+)?class\s+(\w+)/);
    if (classMatch) {
      return { name: classMatch[1], isInterface: false, isAbstract: false };
    }

    return { name: '', isInterface: false, isAbstract: false };
  }

  /**
   * 检查是否是Java接口
   */
  static isJavaInterface(content: string): boolean {
    return /^\s*(?:public\s+)?interface\s+\w+/m.test(content);
  }

  /**
   * 检查是否是Java类
   */
  static isJavaClass(content: string): boolean {
    return /^\s*(?:public\s+|private\s+|protected\s+)?(?:abstract\s+|final\s+)?class\s+\w+/m.test(content);
  }

  /**
   * 检查是否是抽象类
   */
  static isAbstractClass(content: string): boolean {
    return /^\s*(?:public\s+)?abstract\s+class\s+\w+/m.test(content);
  }

  /**
   * 检查是否是MyBatis Mapper
   */
  static isMyBatisMapper(content: string, filePath?: string): boolean {
    // 必须是接口
    if (!/interface\s+\w+/.test(content)) {
      return false;
    }

    // 检查MyBatis标记
    const hasMyBatisMarker = 
      /@Mapper\b/.test(content) ||
      /import\s+org\.apache\.ibatis/.test(content) ||
      /import\s+org\.mybatis/.test(content);

    // 如果类名以Mapper结尾（最常见的命名约定）
    const isMapperByName = /interface\s+\w+Mapper\s*[<{\n]/.test(content);

    // 如果文件路径包含mapper且类名以Mapper结尾
    const isMapperByPath = !!filePath && 
      /[Mm]apper/.test(filePath) && 
      /interface\s+\w*Mapper\b/.test(content);

    return hasMyBatisMarker || isMapperByName || isMapperByPath;
  }

  /**
   * 提取类名
   */
  static extractClassName(content: string): string | null {
    const m = content.match(/\b(?:interface|class)\s+(\w+)/);
    return m?.[1] ?? null;
  }

  /**
   * 提取方法列表
   */
  static extractMethods(content: string): JavaMethod[] {
    const methods: JavaMethod[] = [];
    const lines = content.split('\n');
    
    let braceDepth = 0;
    let inBlockComment = false;

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      
      // 处理块注释
      const bc = this.processBlockComments(rawLine, inBlockComment);
      inBlockComment = bc.inBlockComment;
      const cleanedLine = bc.text;

      // 计算大括号深度
      const braces = this.countBraces(cleanedLine);
      const depthBefore = braceDepth;
      braceDepth += braces.open - braces.close;

      // 只在类体级别(depth=1)查找方法
      if (depthBefore !== 1) continue;

      const trimmed = cleanedLine.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('@')) {
        continue;
      }

      if (!this.looksLikeMethodDeclaration(trimmed)) continue;

      const methodName = this.extractMethodName(trimmed);
      if (!methodName || this.isConstructor(methodName, content)) continue;

      const hasOverride = this.checkOverrideAnnotation(lines, i);
      const parameters = this.extractMethodParams(trimmed);

      methods.push({
        name: methodName,
        line: i,
        column: lines[i].indexOf(methodName),
        hasOverride,
        parameters
      });
    }

    return methods;
  }

  /**
   * 提取实现的接口列表（同步版本，不过滤系统接口）
   * 用于只需要原始列表的场景
   */
  static extractImplementedInterfaces(content: string): string[] {
    const interfaces: string[] = [];

    // 提取类声明 - 改进正则表达式，支持多行
    // 匹配示例: class UserServiceImpl implements UserService
    // 匹配示例: class UserServiceImpl extends BaseService implements UserService, OtherService
    // 匹配示例: class UserServiceImpl<T> implements Service<T>
    const declMatch = content.match(/\bclass\s+([\w<>,\s]+?)(?:\s+extends\s+([\w<>,.?\s]+?))?(?:\s+implements\s+([^{\n;]+))?\s*\{/);
    if (!declMatch) return [];

    // 解析implements子句 (declMatch[3])
    if (declMatch[3]) {
      const implPart = declMatch[3].trim();
      // 分割多个接口，处理泛型
      const implList = implPart.split(',').map(s => {
        let name = s.trim();
        // 移除泛型部分 <...>
        name = name.replace(/<[^>]+>/g, '');
        // 移除空格
        name = name.replace(/\s+/g, '');
        return name;
      }).filter(s => s.length > 0);

      implList.forEach(name => {
        if (name && name !== 'Object') {
          interfaces.push(name);
        }
      });
    }

    // 解析extends子句 (declMatch[2])
    if (declMatch[2]) {
      const parent = declMatch[2].trim().replace(/<[^>]+>/g, '').split(/\s/)[0];
      if (parent && parent !== 'Object') {
        interfaces.push(`__extends:${parent}`);
      }
    }

    return interfaces.filter(i => i !== '');
  }

  /**
   * 提取实现的接口列表（异步版本，过滤系统接口）
   * 使用Red Hat Java扩展获取全限定名进行判断
   * @param content 文件内容
   * @param fileUri 文件URI
   */
  static async extractImplementedInterfacesAsync(
    content: string,
    fileUri: vscode.Uri
  ): Promise<string[]> {
    const allInterfaces = this.extractImplementedInterfaces(content);
    const javaService = JavaLanguageService.getInstance();
    const filtered: string[] = [];

    for (const iface of allInterfaces) {
      // 跳过extends标记
      if (iface.startsWith('__extends:')) {
        filtered.push(iface);
        continue;
      }

      const isSystem = await javaService.isSystemInterfaceWithContext(iface, fileUri, content);
      if (!isSystem) {
        filtered.push(iface);
      }
    }

    return filtered;
  }

  /**
   * 检查是否是系统接口（同步版本，仅支持全限定名）
   * @param interfaceName 接口名称（全限定名）
   */
  static isSystemInterface(interfaceName: string): boolean {
    const javaService = JavaLanguageService.getInstance();
    return javaService.isSystemInterface(interfaceName);
  }

  /**
   * 提取父类
   */
  static extractSuperClass(content: string): string | undefined {
    const match = content.match(/\bextends\s+(\w+)/);
    return match?.[1];
  }

  /**
   * 检查是否是构造方法
   */
  static isConstructor(methodName: string, content: string): boolean {
    return this.extractClassName(content) === methodName;
  }

  /**
   * 检查方法声明格式
   */
  static looksLikeMethodDeclaration(text: string): boolean {
    if (!text.includes('(')) return false;

    const parenIdx = text.indexOf('(');
    const before = text.substring(0, parenIdx).trim();

    // 赋值不是方法声明
    if (before.includes('=')) return false;

    const words = before.split(/\s+/).filter(w => w.length > 0);
    if (words.length < 2) return false;

    const lastWord = words[words.length - 1];
    if (lastWord.includes('.')) return false;

    const firstWord = words[0];
    if (JAVA_KEYWORDS.has(firstWord)) return false;

    return true;
  }

  /**
   * 提取方法名
   */
  static extractMethodName(text: string): string | null {
    const match = text.match(/\b(\w+)\s*\(/);
    if (!match) return null;
    return JAVA_KEYWORDS.has(match[1]) ? null : match[1];
  }

  /**
   * 提取方法参数
   */
  static extractMethodParams(text: string): string {
    const match = text.match(/\(([^)]*)\)/);
    return match?.[1]?.trim() ?? '';
  }

  /**
   * 检查Override注解
   */
  static checkOverrideAnnotation(lines: string[], methodLine: number): boolean {
    for (let i = methodLine - 1; i >= Math.max(0, methodLine - 15); i--) {
      const text = lines[i].trim();
      if (text === '') continue;

      if (!text.startsWith('@') && !text.startsWith('//') &&
          !text.startsWith('*') && !text.startsWith('/*') &&
          (text.endsWith(';') || text.endsWith('{') || text.endsWith('}'))) {
        break;
      }

      if (text.startsWith('@') && text.includes('@Override')) {
        return true;
      }
    }
    return false;
  }

  /**
   * 解析类型列表
   */
  static parseTypeList(str: string): string[] {
    const types: string[] = [];
    let depth = 0, current = '';
    for (const ch of str) {
      if (ch === '<') { depth++; }
      else if (ch === '>') { depth--; }
      else if (ch === ',' && depth === 0) {
        const name = current.trim().split('<')[0].trim();
        if (name && /^\w+$/.test(name)) { types.push(name); }
        current = '';
        continue;
      }
      current += ch;
    }
    const last = current.trim().split('<')[0].trim();
    if (last && /^\w+$/.test(last)) { types.push(last); }
    return types;
  }

  /**
   * 处理块注释
   */
  static processBlockComments(line: string, inBlockComment: boolean): { text: string; inBlockComment: boolean } {
    let result = '';
    let i = 0;
    let inComment = inBlockComment;

    while (i < line.length) {
      if (inComment) {
        const endIdx = line.indexOf('*/', i);
        if (endIdx >= 0) { i = endIdx + 2; inComment = false; }
        else { break; }
      } else {
        const startIdx = line.indexOf('/*', i);
        if (startIdx >= 0) {
          result += line.substring(i, startIdx);
          const endIdx = line.indexOf('*/', startIdx + 2);
          if (endIdx >= 0) { i = endIdx + 2; }
          else { inComment = true; break; }
        } else {
          result += line.substring(i);
          break;
        }
      }
    }
    return { text: result, inBlockComment: inComment };
  }

  /**
   * 计算大括号数量
   */
  static countBraces(line: string): { open: number; close: number } {
    const stripped = line
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      .replace(/'(?:[^'\\]|\\.)*'/g, "''")
      .replace(/\/\/.*$/, '');
    
    let open = 0, close = 0;
    for (const ch of stripped) {
      if (ch === '{') { open++; }
      else if (ch === '}') { close++; }
    }
    return { open, close };
  }

  /**
   * 转义正则特殊字符
   */
  static escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 检查内容是否包含特定方法（接口方法）
   * 支持带注解的参数，如 @Param("empName")String empName
   */
  static containsMethod(content: string, methodName: string): boolean {
    const escaped = this.escapeRegex(methodName);
    // 使用平衡括号匹配，支持嵌套括号（用于注解如@Param("xxx")）
    const pattern = `\\b${escaped}\\s*\\((?:[^()]|\\((?:[^()]|\\([^)]*\\))*\\))*\\)\\s*(?:throws\\s+[\\w\\s,.<>]+)?\\s*;`;
    return new RegExp(pattern).test(content);
  }

  /**
   * 检查内容是否包含特定方法实现
   */
  static containsImplementedMethod(content: string, methodName: string): boolean {
    const escaped = this.escapeRegex(methodName);
    return new RegExp(`\\b${escaped}\\s*\\([^)]*\\)\\s*(?:throws\\s+[\\w\\s,.<>]+)?\\s*\\{`).test(content) ||
           new RegExp(`(?:public|protected)\\s+[\\w<>\\[\\],.\\s]+\\s+${escaped}\\s*\\(`).test(content);
  }
}
