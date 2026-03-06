/**
 * 类型定义文件
 */

import * as vscode from 'vscode';

/** 导航选项 */
export interface NavigationOptions {
  openSideBySide?: boolean;
  revealType?: vscode.TextEditorRevealType;
}

/** Mapper映射 */
export interface MapperMapping {
  javaPath: string;
  xmlPath?: string;
  namespace: string;
  className: string;
  methods: Map<string, MethodMapping>;
}

/** 方法映射 */
export interface MethodMapping {
  name: string;
  javaPosition: { line: number; column: number };
  xmlPosition?: { line: number; column: number };
  sqlType?: 'select' | 'insert' | 'update' | 'delete';
}

/** XML解析结果 */
export interface XmlParseResult {
  namespace: string;
  filePath: string;
  sqlElements: SqlElement[];
}

/** SQL元素 */
export interface SqlElement {
  id: string;
  type: 'select' | 'insert' | 'update' | 'delete';
  line: number;
  column: number;
}

/** Java解析结果 */
export interface JavaParseResult {
  packageName: string;
  className: string;
  isInterface: boolean;
  isAbstract: boolean;
  isMapper: boolean;
  methods: JavaMethod[];
  interfaces: string[];
  superClass?: string;
}

/** Java方法 */
export interface JavaMethod {
  name: string;
  line: number;
  column: number;
  hasOverride: boolean;
  parameters: string;
}

/** 缓存条目 */
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  version: number;
}