/**
 * Java 语言服务工具类
 * 封装对 Red Hat Java 扩展 API 的调用
 * 提供类型层次结构、接口实现等高级功能
 */

import * as vscode from 'vscode';
import { Logger } from './logger';

export interface JavaTypeInfo {
  name: string;
  fullyQualifiedName: string;
  kind: 'class' | 'interface' | 'enum' | 'annotation';
  superClass?: string;
  interfaces: string[];
  isAbstract: boolean;
  isFinal: boolean;
}

export interface JavaMethodInfo {
  name: string;
  declaringType: string;
  returnType: string;
  parameters: Array<{
    name: string;
    type: string;
  }>;
  isAbstract: boolean;
  isStatic: boolean;
  isDefault: boolean;
}

export class JavaLanguageService {
  private static instance: JavaLanguageService;
  private logger: Logger;
  private isJavaExtensionAvailable: boolean = false;

  private constructor() {
    this.logger = Logger.getInstance();
    this.checkJavaExtensionAvailability();
  }

  static getInstance(): JavaLanguageService {
    if (!JavaLanguageService.instance) {
      JavaLanguageService.instance = new JavaLanguageService();
    }
    return JavaLanguageService.instance;
  }

  /**
   * 检查 Red Hat Java 扩展是否可用
   */
  private async checkJavaExtensionAvailability(): Promise<void> {
    const javaExtension = vscode.extensions.getExtension('redhat.java');
    this.isJavaExtensionAvailable = !!javaExtension && javaExtension.isActive;
    this.logger.info(`[JavaLanguageService] Java extension available: ${this.isJavaExtensionAvailable}`);
  }

  /**
   * 是否可以使用 Java 语言服务
   */
  canUseJavaLanguageServer(): boolean {
    const config = vscode.workspace.getConfiguration('javaNavigator');
    const enabled = config.get<boolean>('useJavaLanguageServer', true);
    return enabled && this.isJavaExtensionAvailable;
  }

  /**
   * 获取类型的层次结构信息
   * @param uri 文件 URI
   * @param position 类型所在位置
   */
  async getTypeHierarchy(uri: vscode.Uri, position: vscode.Position): Promise<JavaTypeInfo | null> {
    if (!this.canUseJavaLanguageServer()) {
      return null;
    }

    try {
      // 尝试使用 Java 扩展的命令获取类型信息
      const result = await vscode.commands.executeCommand<any>(
        'java.execute.workspaceCommand',
        'java.get.type.hierarchy',
        uri.toString(),
        position
      );

      if (result) {
        return this.parseTypeInfo(result);
      }
    } catch (error) {
      this.logger.debug('[JavaLanguageService] Failed to get type hierarchy:', error);
    }

    return null;
  }

  /**
   * 获取类实现的所有接口（包括从父类继承的）
   * @param uri 文件 URI
   * @param className 类名
   */
  async getImplementedInterfaces(uri: vscode.Uri, className: string): Promise<string[]> {
    if (!this.canUseJavaLanguageServer()) {
      return [];
    }

    try {
      // 使用 Java 扩展获取接口信息
      const result = await vscode.commands.executeCommand<any>(
        'java.execute.workspaceCommand',
        'java.get.implemented.interfaces',
        uri.toString(),
        className
      );

      if (Array.isArray(result)) {
        return result.filter((iface: string) => !this.isSystemInterface(iface));
      }
    } catch (error) {
      this.logger.debug('[JavaLanguageService] Failed to get implemented interfaces:', error);
    }

    return [];
  }

  /**
   * 获取接口的所有实现类
   * @param interfaceName 接口名
   */
  async getInterfaceImplementations(interfaceName: string): Promise<string[]> {
    if (!this.canUseJavaLanguageServer()) {
      return [];
    }

    try {
      const result = await vscode.commands.executeCommand<any>(
        'java.execute.workspaceCommand',
        'java.get.interface.implementations',
        interfaceName
      );

      if (Array.isArray(result)) {
        return result;
      }
    } catch (error) {
      this.logger.debug('[JavaLanguageService] Failed to get interface implementations:', error);
    }

    return [];
  }

  /**
   * 获取方法的定义信息
   * @param uri 文件 URI
   * @param position 方法所在位置
   */
  async getMethodInfo(uri: vscode.Uri, position: vscode.Position): Promise<JavaMethodInfo | null> {
    if (!this.canUseJavaLanguageServer()) {
      return null;
    }

    try {
      const result = await vscode.commands.executeCommand<any>(
        'java.execute.workspaceCommand',
        'java.get.method.info',
        uri.toString(),
        position
      );

      if (result) {
        return this.parseMethodInfo(result);
      }
    } catch (error) {
      this.logger.debug('[JavaLanguageService] Failed to get method info:', error);
    }

    return null;
  }

  /**
   * 获取类型的详细信息（使用 DocumentSymbol）
   * @param uri 文件 URI
   */
  async getTypeDetails(uri: vscode.Uri): Promise<JavaTypeInfo | null> {
    try {
      const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        uri
      );

      if (!symbols || symbols.length === 0) {
        return null;
      }

      // 找到类或接口符号
      const typeSymbol = symbols.find(s =>
        s.kind === vscode.SymbolKind.Class ||
        s.kind === vscode.SymbolKind.Interface
      );

      if (!typeSymbol) {
        return null;
      }

      // 解析详细信息
      const kind = typeSymbol.kind === vscode.SymbolKind.Interface ? 'interface' : 'class';
      const interfaces: string[] = [];

      // 从 detail 中解析实现的接口
      if (typeSymbol.detail) {
        const implMatch = typeSymbol.detail.match(/implements\s+([^{]+)/);
        if (implMatch) {
          const ifaceList = implMatch[1].split(',').map(s => s.trim());
          interfaces.push(...ifaceList.filter(i => !this.isSystemInterface(i)));
        }
      }

      return {
        name: typeSymbol.name,
        fullyQualifiedName: typeSymbol.name,
        kind,
        interfaces,
        isAbstract: typeSymbol.detail?.includes('abstract') || false,
        isFinal: typeSymbol.detail?.includes('final') || false
      };
    } catch (error) {
      this.logger.debug('[JavaLanguageService] Failed to get type details:', error);
      return null;
    }
  }

  /**
   * 检查是否是系统接口
   */
  private isSystemInterface(interfaceName: string): boolean {
    const systemInterfaces = new Set([
      'Serializable', 'Comparable', 'Cloneable', 'Runnable', 'Callable',
      'Iterable', 'Iterator', 'Collection', 'List', 'Set', 'Map', 'Queue',
      'Enumeration', 'Observer', 'AutoCloseable', 'Closeable', 'Flushable',
      'Readable', 'Appendable', 'CharSequence', 'Externalizable',
      'Supplier', 'Consumer', 'Predicate', 'Function', 'BiFunction',
      'UnaryOperator', 'BinaryOperator', 'BiConsumer', 'BiPredicate',
      'ApplicationContextAware', 'BeanFactoryAware', 'BeanNameAware',
      'InitializingBean', 'DisposableBean', 'FactoryBean',
      'BeanPostProcessor', 'BeanFactoryPostProcessor', 'EnvironmentAware',
      'ResourceLoaderAware', 'MessageSourceAware', 'ApplicationEventPublisherAware',
      'ServletContextAware', 'ServletConfigAware', 'LoadTimeWeaverAware',
      'ImportAware', 'Aware', 'Ordered', 'PriorityOrdered',
      'Interceptor', 'TypeHandler', 'ResultHandler', 'RowBounds',
      'HttpServletRequest', 'HttpServletResponse', 'ServletRequest', 'ServletResponse',
      'Filter', 'Servlet', 'Listener', 'SessionAware', 'RequestAware',
      'Principal', 'GrantedAuthority', 'UserDetails', 'Authentication',
      'EntityListener', 'AttributeConverter', 'Specification',
      'Marker', 'Tag', 'TagSupport', 'BodyTag', 'SimpleTag',
      'ObjectInputValidation', 'ObjectInputFilter',
      'Future', 'Delayed', 'TransferQueue', 'BlockingQueue', 'BlockingDeque',
      'AnnotatedElement', 'GenericDeclaration', 'Type', 'TypeVariable',
      'SerializablePermission', 'SocketOptions', 'FileNameMap',
      'Comparator', 'Formattable', 'RandomAccess', 'NavigableMap', 'NavigableSet',
      'SortedMap', 'SortedSet', 'Deque', 'ListIterator', 'Spliterator',
      'PrimitiveIterator', 'OfInt', 'OfLong', 'OfDouble'
    ]);

    // 移除泛型部分
    const baseName = interfaceName.replace(/<[^>]+>/g, '').trim();
    return systemInterfaces.has(baseName);
  }

  /**
   * 解析类型信息
   */
  private parseTypeInfo(data: any): JavaTypeInfo {
    return {
      name: data.name || '',
      fullyQualifiedName: data.fullyQualifiedName || data.name || '',
      kind: data.kind || 'class',
      superClass: data.superClass,
      interfaces: data.interfaces || [],
      isAbstract: data.isAbstract || false,
      isFinal: data.isFinal || false
    };
  }

  /**
   * 解析方法信息
   */
  private parseMethodInfo(data: any): JavaMethodInfo {
    return {
      name: data.name || '',
      declaringType: data.declaringType || '',
      returnType: data.returnType || 'void',
      parameters: data.parameters || [],
      isAbstract: data.isAbstract || false,
      isStatic: data.isStatic || false,
      isDefault: data.isDefault || false
    };
  }
}
