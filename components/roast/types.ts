export type Severity = 'critical' | 'high' | 'medium' | 'good';

export interface Finding {
  severity: Severity;
  title: string;
  quote?: string;
  action: string;
}

export interface DimensionResult {
  dimension: string;
  score: number;
  summary: string;
  findings: Finding[];
  failed?: boolean;
}
