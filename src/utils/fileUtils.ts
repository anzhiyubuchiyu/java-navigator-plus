/**
 * 文件操作工具类
 * 统一处理文件打开、定位等操作
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';

/**
 * 打开文件并定位到指定位置
 */
export async function openFileAtPosition(
  filePath: string,
  position?: { line: number; column: number }
): Promise<void> {
  const uri = vscode.Uri.file(filePath);
  const document = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(document);

  if (position) {
    const vscodePosition = new vscode.Position(position.line, position.column);
    editor.selection = new vscode.Selection(vscodePosition, vscodePosition);
    editor.revealRange(
      new vscode.Range(vscodePosition, vscodePosition),
      vscode.TextEditorRevealType.InCenter
    );
  }
}

/**
 * 读取文件内容
 */
export async function readFileContent(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * 检查文件是否存在
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取排除模式
 */
export function getExcludePattern(): string {
  const config = vscode.workspace.getConfiguration('javaNavigator');
  const excludeFolders = config.get<string[]>('excludeFolders', [
    'node_modules', '.git', '.svn', '.hg',
    'target', 'build', 'out', 'dist',
    '.idea', '.vscode', '.settings',
    'bin', 'obj', 'coverage', '.nyc_output',
    '.gradle', 'gradle', '.mvn',
    'mvnw', 'mvnw.cmd', 'gradlew', 'gradlew.bat'
  ]);
  if (excludeFolders.length === 0) return '';
  if (excludeFolders.length === 1) return `**/${excludeFolders[0]}/**`;
  return `{${excludeFolders.map(f => `**/${f}/**`).join(',')}}`;
}

/**
 * 检查是否应该忽略文件
 */
export function shouldIgnoreFile(filePath: string): boolean {
  const ignorePatterns = [
    '/node_modules/',
    '/.git/', '\\.git\\',
    '/.svn/', '\\.svn\\',
    '/.hg/', '\\.hg\\',
    '/target/', '\\target\\',
    '/build/', '\\build\\',
    '/out/', '\\out\\',
    '/dist/', '\\dist\\',
    '/.idea/', '\\.idea\\',
    '/.vscode/', '\\.vscode\\',
    '/.settings/', '\\.settings\\',
    '/bin/', '\\bin\\',
    '/obj/', '\\obj\\',
    '/coverage/', '\\coverage\\',
    '/.nyc_output/', '\\.nyc_output\\',
    '/.gradle/', '\\.gradle\\',
    '/gradle/', '\\gradle\\',
    '.tmp', '.temp', '~'
  ];

  return ignorePatterns.some(pattern => filePath.includes(pattern));
}
