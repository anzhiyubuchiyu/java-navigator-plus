/**
 * 统一导航类型定义
 * 
 * 架构设计：
 * - a: 接口与实现之间的跳转 (Interface ↔ Implementation)
 *   - a1: 类级别跳转 (Class level)
 *   - a2: 方法级别跳转 (Method level)
 * 
 * - b: XML与Mapper之间的跳转 (XML ↔ Mapper)
 *   - b1: 类级别跳转 (Class level)
 *   - b2: 方法级别跳转 (Method level)
 */

import * as vscode from 'vscode';

/** 跳转类型 */
export type NavigationType = 'a1' | 'a2' | 'b1' | 'b2';

/** 导航方向 */
export type NavigationDirection = 
  | 'interface-to-impl'      // a: 接口→实现
  | 'impl-to-interface'      // a: 实现→接口
  | 'mapper-to-xml'          // b: Mapper→XML
  | 'xml-to-mapper';         // b: Mapper→XML

/** 候选文件信息 */
export interface NavigationCandidate {
  filePath: string;
  name: string;
  score: number;
  metadata?: Record<string, unknown>;
}

/** 导航结果 */
export interface NavigationResult {
  success: boolean;
  targetPath?: string;
  targetPosition?: vscode.Position;
  error?: string;
}

/** 跳转上下文 */
export interface NavigationContext {
  sourcePath: string;
  sourcePosition?: vscode.Position;
  type: NavigationType;
  direction: NavigationDirection;
  targetName?: string;  // 方法名或SQL ID
}


