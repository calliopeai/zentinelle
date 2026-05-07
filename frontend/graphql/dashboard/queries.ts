import { gql } from "@apollo/client";

export const DASHBOARD_STATS = gql`
  query DashboardStats {
    dashboardStats {
      agents {
        total
        active
        inactive
        healthy
        unhealthy
      }
      policies {
        total
        enabled
        disabled
        byType {
          type
          count
        }
      }
      apiUsage {
        today
        thisWeek
        thisMonth
        trend
      }
      recentActivity {
        id
        type
        description
        timestamp
        actor
      }
      alerts {
        id
        severity
        title
        description
        createdAt
      }
      checklist {
        items {
          key
          isComplete
          completedAt
        }
        completedCount
        totalCount
        progressPercent
        isAllComplete
        dismissed
      }
    }
  }
`;
