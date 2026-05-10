export interface CodeAnalyzerOptions {
  /**
   * File patterns to include in analysis
   */
  include?: string[];
  
  /**
   * File patterns to exclude from analysis
   */
  exclude?: string[];
  
  /**
   * Whether to include verbose output
   */
  verbose?: boolean;
  
  /**
   * Maximum depth for recursive scanning
   */
  maxDepth?: number;
}

export interface CodeAnalysisResult {
  /**
   * Path to the analyzed file or directory
   */
  path: string;
  
  /**
   * Vulnerabilities found in the code
   */
  vulnerabilities: CodeVulnerability[];
  
  /**
   * Analysis completion timestamp
   */
  analyzedAt: Date;
  
  /**
   * Analysis duration in milliseconds
   */
  duration: number;
  
  /**
   * Number of files analyzed
   */
  filesAnalyzed: number;
}

export class CodeAnalyzer {
  private options: CodeAnalyzerOptions;
  
  constructor(options?: CodeAnalyzerOptions) {
    this.options = {
      verbose: false,
      maxDepth: 10,
      ...options,
    };
  }
  
  /**
   * Analyze source code for security vulnerabilities
   */
  async analyze(path: string): Promise<CodeAnalysisResult> {
    const startTime = Date.now();
    
    // Initialize analysis result
    const result: CodeAnalysisResult = {
      path,
      vulnerabilities: [],
      analyzedAt: new Date(),
      duration: 0,
      filesAnalyzed: 0,
    };
    
    try {
      // Perform static analysis
      const staticAnalyzer = new StaticAnalyzer();
      const staticResults = await staticAnalyzer.analyze(path, {
        include: this.options.include,
        exclude: this.options.exclude,
        maxDepth: this.options.maxDepth,
      });
      
      // Perform dynamic analysis if needed
      const dynamicAnalyzer = new DynamicAnalyzer();
      const dynamicResults = await dynamicAnalyzer.analyze(path);
      
      // Combine results
      result.vulnerabilities = [...staticResults.vulnerabilities, ...dynamicResults.vulnerabilities];
      result.filesAnalyzed = staticResults.filesAnalyzed;
      
      result.duration = Date.now() - startTime;
    } catch (error) {
      // Handle analysis errors
      result.vulnerabilities.push({
        type: 'CodeAnalysisError',
        severity: 'high',
        description: 'Failed to analyze source code',
        location: path,
        recommendation: 'Check file permissions and syntax'
      });
    }
    
    return result;
  }
  
  /**
   * Analyze multiple paths for security vulnerabilities
   */
  async analyzePaths(paths: string[]): Promise<CodeAnalysisResult[]> {
    const results: CodeAnalysisResult[] = [];
    
    for (const path of paths) {
      const result = await this.analyze(path);
      results.push(result);
    }
    
    return results;
  }
}

export interface CodeVulnerability {
  /**
   * Type of vulnerability (e.g., SQLi, XSS, buffer overflow)
   */
  type: string;
  
  /**
   * Severity level (critical, high, medium, low, info)
   */
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  
  /**
   * Description of the vulnerability
   */
  description: string;
  
  /**
   * File path where vulnerability was found
   */
  filePath: string;
  
  /**
   * Line number where vulnerability was found
   */
  lineNumber?: number;
  
  /**
   * Recommendation for fixing the vulnerability
   */
  recommendation: string;
  
  /**
   * Evidence of the vulnerability
   */
  evidence?: string;
}