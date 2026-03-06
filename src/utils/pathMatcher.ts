/**
 * 路径匹配工具类
 * 提供统一的路径相似度计算和模块名提取功能
 * 
 * 支持的命名模式：
 * - 同级模式：BookService.java + BookServiceImpl.java
 * - impl子目录：BookService.java + impl/BookServiceImpl.java
 * - Mapper模式：UserMapper.java + UserMapper.xml
 */

export class PathMatcher {
  /**
   * 计算两个文件路径的相似度分数
   * 针对Service/Impl、Mapper/XML等常见Java项目结构优化
   */
  static calculateSimilarity(sourcePath: string, targetPath: string): number {
    const parts1 = sourcePath.toLowerCase().split(/[\\/]/);
    const parts2 = targetPath.toLowerCase().split(/[\\/]/);

    // 提取文件名（不含扩展名）
    const fileName1 = parts1[parts1.length - 1].replace(/\.\w+$/, '');
    const fileName2 = parts2[parts2.length - 1].replace(/\.\w+$/, '');

    // 提取模块名
    const module1 = this.extractModuleName(sourcePath);
    const module2 = this.extractModuleName(targetPath);

    let score = 0;

    // ===== 核心命名模式匹配 =====
    
    // 1. 文件名完全匹配（如 UserMapper.java <-> UserMapper.xml）+100分
    if (fileName1 === fileName2) {
      score += 100;
    }
    // 2. Service/Impl命名模式匹配（如 BookService <-> BookServiceImpl）+80分
    else if (this.isNamingPair(fileName1, fileName2)) {
      score += 80;
    }
    // 3. 基础名称匹配（如 BookService <-> BookServiceImpl 去掉Impl后匹配）+60分
    else if (this.getBaseName(fileName1) === this.getBaseName(fileName2)) {
      score += 60;
    }

    // ===== 目录结构匹配 =====

    // 4. 模块匹配 +200分（大幅提高权重，确保同模块优先）
    if (module1 && module2 && module1 === module2) {
      score += 200;
    }

    // 5. impl子目录模式检测
    // 如果目标是impl目录下的文件，且源文件不在impl目录，加分
    const hasImplDir1 = parts1.includes('impl');
    const hasImplDir2 = parts2.includes('impl');
    if (hasImplDir1 !== hasImplDir2) {
      // 一个是impl目录，一个不是，这是期望的Service/Impl结构
      score += 20;
    }

    // 6. 包路径匹配（从后往前匹配，使用点分隔的包路径）
    const package1 = this.extractPackagePath(sourcePath);
    const package2 = this.extractPackagePath(targetPath);
    if (package1 && package2) {
      const pkgParts1 = package1.split('.');
      const pkgParts2 = package2.split('.');
      const minPkgLen = Math.min(pkgParts1.length, pkgParts2.length);
      
      for (let i = 1; i <= minPkgLen; i++) {
        if (pkgParts1[pkgParts1.length - i] === pkgParts2[pkgParts2.length - i]) {
          score += 10; // 提高包路径匹配权重
        } else {
          break;
        }
      }
    }

    // 7. 目录结构匹配（从后往前匹配目录名）
    const minPartsLen = Math.min(parts1.length, parts2.length);
    for (let i = 2; i <= Math.min(minPartsLen, 6); i++) { // 最多比较6层目录
      if (parts1[parts1.length - i] === parts2[parts2.length - i]) {
        score += 5;
      } else {
        break;
      }
    }

    return score;
  }

  /**
   * 检查两个文件名是否是命名对（如 Service/Impl, Mapper/XML）
   */
  private static isNamingPair(name1: string, name2: string): boolean {
    const pairs = [
      { suffix: 'impl', pattern: /^(.+)impl$/i },
      { suffix: 'service', pattern: /^(.+)serviceimpl$/i },
      { suffix: 'dao', pattern: /^(.+)daoimpl$/i },
      { suffix: 'mapper', pattern: /^(.+)mapper$/i },
    ];

    for (const pair of pairs) {
      // 检查 name1 + suffix = name2
      if (name1.toLowerCase() + pair.suffix === name2.toLowerCase()) {
        return true;
      }
      // 检查 name2 + suffix = name1
      if (name2.toLowerCase() + pair.suffix === name1.toLowerCase()) {
        return true;
      }
      // 检查 pattern 匹配
      const match1 = name1.match(pair.pattern);
      const match2 = name2.match(pair.pattern);
      if (match1 && match2 && match1[1] === match2[1]) {
        return true;
      }
    }

    return false;
  }

  /**
   * 获取基础名称（去掉 Impl, Service等后缀）
   */
  private static getBaseName(fileName: string): string {
    return fileName
      .replace(/impl$/i, '')
      .replace(/service$/i, '')
      .replace(/dao$/i, '')
      .replace(/mapper$/i, '');
  }

  /**
   * 从文件路径中提取模块名
   */
  static extractModuleName(filePath: string): string {
    const parts = filePath.split(/[\\/]/);
    const srcIndex = parts.indexOf('src');
    if (srcIndex > 0) {
      return parts[srcIndex - 1];
    }
    // 返回倒数第三个目录作为模块名
    if (parts.length >= 3) {
      return parts[parts.length - 3];
    }
    return '';
  }

  /**
   * 从候选列表中选择最匹配的路径
   */
  static selectBestMatch(
    referencePath: string,
    candidates: string[]
  ): string | undefined {
    if (candidates.length === 0) return undefined;
    if (candidates.length === 1) return candidates[0];

    const scored = candidates.map((path) => ({
      path,
      score: this.calculateSimilarity(referencePath, path),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored[0].path;
  }

  /**
   * 标准化路径分隔符（统一为/）
   */
  static normalizeSeparators(path: string): string {
    return path.replace(/\\/g, '/');
  }

  /**
   * 从路径中提取包路径（如 com/example/user）
   * 支持 java 和 resources 目录
   */
  static extractPackagePath(filePath: string): string {
    const normalized = this.normalizeSeparators(filePath);
    
    // 尝试从 /java/ 提取（Java源文件）
    const javaIndex = normalized.indexOf('/java/');
    if (javaIndex >= 0) {
      const afterJava = normalized.substring(javaIndex + 6);
      const lastSlash = afterJava.lastIndexOf('/');
      if (lastSlash > 0) {
        return afterJava.substring(0, lastSlash).replace(/\//g, '.');
      }
    }
    
    // 尝试从 /resources/ 提取（XML配置文件）
    const resourcesIndex = normalized.indexOf('/resources/');
    if (resourcesIndex >= 0) {
      const afterResources = normalized.substring(resourcesIndex + 11);
      const lastSlash = afterResources.lastIndexOf('/');
      if (lastSlash > 0) {
        // 如果路径包含 mapper/mappers，返回其上级目录
        const dirPath = afterResources.substring(0, lastSlash);
        if (dirPath.includes('/mapper/') || dirPath.includes('/mappers/')) {
          return dirPath.replace(/\/mapper\b|\/mappers\b/g, '').replace(/\//g, '.');
        }
        return dirPath.replace(/\//g, '.');
      }
    }
    
    return '';
  }
}
