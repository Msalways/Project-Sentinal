export interface ServiceInfo {
  /**
   * Name of the service
   */
  name: string;
  
  /**
   * Version of the service
   */
  version?: string;
}

export class StaticAnalyzer {
  analyze(
    path: string,
    options?: StaticAnalyzerOptions
  ): StaticAnalysisResult {
    // Initialize analysis result
    const result: StaticAnalysisResult = {
      path: path,
      vulnerabilities: [],
      analyzedAt: new Date(),
      duration: 0,
      filesAnalyzed: 0
    };
    
    // Return the result
    return result;
  }
}

export interface StaticAnalyzerOptions {
  /**
   * File patterns to include in analysis
   */
  include?: string[];
  
  /**
   * File patterns to exclude from analysis
   */
  exclude?: string[];
  
  /**
   * Maximum depth for recursive scanning
   */
  maxDepth?: number;
}

export interface StaticAnalysisResult {
  /**
   * Path to the analyzed file or directory
   */
  path: string;
  
  /**
   * Vulnerabilities found in the code
   */
  vulnerabilities: any[];
  
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