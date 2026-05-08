export interface AgentStats {
  total: number;
  active: number;
  inactive: number;
  healthy: number;
  unhealthy: number;
}

export interface PolicyByType {
  type: string | null;
  count: number;
}

export interface PolicyStats {
  total: number;
  enabled: number;
  disabled: number;
  byType: PolicyByType[];
}

export interface ApiUsage {
  today: number;
  thisWeek: number;
  thisMonth: number;
  trend: number;
  last7Days: number[];
}

export interface RecentActivity {
  id: string | null;
  type: string | null;
  description: string | null;
  timestamp: string | null;
  actor: string | null;
}

export interface Alert {
  id: string | null;
  severity: string | null;
  title: string | null;
  description: string | null;
  createdAt: string | null;
}

export interface ChecklistItemStats {
  key: string | null;
  isComplete: boolean;
  completedAt: string | null;
}

export interface ChecklistStats {
  items: ChecklistItemStats[];
  completedCount: number;
  totalCount: number;
  progressPercent: number;
  isAllComplete: boolean;
  dismissed: boolean;
}

export interface DashboardStats {
  agents: AgentStats | null;
  policies: PolicyStats | null;
  apiUsage: ApiUsage | null;
  recentActivity: RecentActivity[];
  alerts: Alert[];
  checklist: ChecklistStats | null;
}

export interface DashboardStatsData {
  dashboardStats: DashboardStats | null;
}
