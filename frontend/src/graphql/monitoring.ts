import { gql } from '@apollo/client';

// =============================================================================
// Interaction Logs (Real-time Monitor)
// =============================================================================

export const GET_INTERACTION_LOGS = gql`
  query GetInteractionLogs(
    $userIdentifier: String
    $endpointId: ID
    $aiProvider: String
    $aiModel: String
    $interactionType: String
    $hasViolations: Boolean
    $startDate: DateTime
    $endDate: DateTime
    $first: Int
    $after: String
  ) {
    interactionLogs(
      userIdentifier: $userIdentifier
      endpointId: $endpointId
      aiProvider: $aiProvider
      aiModel: $aiModel
      interactionType: $interactionType
      hasViolations: $hasViolations
      startDate: $startDate
      endDate: $endDate
      first: $first
      after: $after
    ) {
      edges {
        node {
          id
          interactionType
          interactionTypeDisplay
          sessionId
          requestId
          aiProvider
          aiModel
          inputContent
          inputTokenCount
          outputContent
          outputTokenCount
          totalTokens
          estimatedCostUsd
          latencyMs
          classification
          isWorkRelated
          topics
          userIdentifier
          endpointName
          deploymentName
          hasViolations
          violationCount
          wasBlocked
          occurredAt
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const GET_INTERACTION_LOG = gql`
  query GetInteractionLog($id: ID!) {
    interactionLog(id: $id) {
      id
      interactionType
      interactionTypeDisplay
      sessionId
      requestId
      aiProvider
      aiModel
      inputContent
      inputTokenCount
      outputContent
      outputTokenCount
      systemPrompt
      toolCalls
      totalTokens
      estimatedCostUsd
      latencyMs
      classification
      isWorkRelated
      topics
      userIdentifier
      ipAddress
      userAgent
      endpointName
      deploymentName
      hasViolations
      violationCount
      wasBlocked
      occurredAt
      createdAt
    }
  }
`;

// =============================================================================
// Content Scans (Scanner Dashboard)
// =============================================================================

export const GET_CONTENT_SCANS = gql`
  query GetContentScans(
    $userIdentifier: String
    $endpointId: ID
    $hasViolations: Boolean
    $contentType: String
    $startDate: DateTime
    $endDate: DateTime
    $first: Int
    $after: String
  ) {
    contentScans(
      userIdentifier: $userIdentifier
      endpointId: $endpointId
      hasViolations: $hasViolations
      contentType: $contentType
      startDate: $startDate
      endDate: $endDate
      first: $first
      after: $after
    ) {
      edges {
        node {
          id
          contentType
          contentTypeDisplay
          contentPreview
          contentLength
          status
          statusDisplay
          scanMode
          scannedAt
          scanDurationMs
          hasViolations
          violationCount
          maxSeverity
          actionTaken
          wasBlocked
          wasRedacted
          tokenCount
          estimatedCostUsd
          userIdentifier
          endpointName
          deploymentName
          sessionId
          createdAt
          violations {
            id
            ruleType
            ruleTypeDisplay
            severity
            severityDisplay
            ruleName
            matchedPattern
            category
            confidence
            wasBlocked
            wasRedacted
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const GET_CONTENT_SCAN = gql`
  query GetContentScan($id: ID!) {
    contentScan(id: $id) {
      id
      contentType
      contentTypeDisplay
      contentPreview
      contentLength
      contentHash
      status
      statusDisplay
      scanMode
      scannedAt
      scanDurationMs
      hasViolations
      violationCount
      maxSeverity
      actionTaken
      wasBlocked
      wasRedacted
      tokenCount
      estimatedCostUsd
      userIdentifier
      endpointName
      deploymentName
      sessionId
      requestId
      ipAddress
      userAgent
      createdAt
      violations {
        id
        ruleType
        ruleTypeDisplay
        severity
        severityDisplay
        ruleName
        matchedPattern
        matchedText
        matchStart
        matchEnd
        category
        confidence
        metadata
        wasBlocked
        wasRedacted
        userNotified
        adminNotified
        createdAt
      }
    }
  }
`;

// =============================================================================
// Content Violations
// =============================================================================

export const GET_CONTENT_VIOLATIONS = gql`
  query GetContentViolations(
    $ruleType: String
    $severity: String
    $startDate: DateTime
    $endDate: DateTime
    $first: Int
    $after: String
  ) {
    contentViolations(
      ruleType: $ruleType
      severity: $severity
      startDate: $startDate
      endDate: $endDate
      first: $first
      after: $after
    ) {
      edges {
        node {
          id
          ruleType
          ruleTypeDisplay
          severity
          severityDisplay
          ruleName
          matchedPattern
          category
          confidence
          wasBlocked
          wasRedacted
          createdAt
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// =============================================================================
// Content Rules (Scanner Configuration)
// =============================================================================

export const GET_CONTENT_RULES = gql`
  query GetContentRules(
    $search: String
    $ruleType: String
    $severity: String
    $enforcement: String
    $enabled: Boolean
    $first: Int
    $after: String
  ) {
    contentRules(
      search: $search
      ruleType: $ruleType
      severity: $severity
      enforcement: $enforcement
      enabled: $enabled
      first: $first
      after: $after
    ) {
      edges {
        node {
          id
          name
          description
          ruleType
          ruleTypeDisplay
          severity
          severityDisplay
          enforcement
          enforcementDisplay
          scanMode
          scanInput
          scanOutput
          scanContext
          scopeType
          scopeName
          priority
          enabled
          notifyUser
          notifyAdmins
          webhookUrl
          violationCount
          config
          createdAt
          updatedAt
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const GET_CONTENT_RULE = gql`
  query GetContentRule($id: ID!) {
    contentRule(id: $id) {
      id
      name
      description
      ruleType
      ruleTypeDisplay
      severity
      severityDisplay
      enforcement
      enforcementDisplay
      scanMode
      scanInput
      scanOutput
      scanContext
      scopeType
      scopeName
      priority
      enabled
      notifyUser
      notifyAdmins
      webhookUrl
      violationCount
      config
      createdAt
      updatedAt
    }
  }
`;

// =============================================================================
// Compliance Alerts
// =============================================================================

export const GET_COMPLIANCE_ALERTS = gql`
  query GetComplianceAlerts(
    $status: String
    $severity: String
    $alertType: String
    $first: Int
    $after: String
  ) {
    complianceAlerts(
      status: $status
      severity: $severity
      alertType: $alertType
      first: $first
      after: $after
    ) {
      edges {
        node {
          id
          alertType
          alertTypeDisplay
          severity
          severityDisplay
          title
          description
          userIdentifier
          endpointName
          violationCount
          firstViolationAt
          lastViolationAt
          status
          statusDisplay
          acknowledgedByUsername
          acknowledgedAt
          resolvedByUsername
          resolvedAt
          resolutionNotes
          metadata
          createdAt
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// =============================================================================
// Compliance Alert Mutations
// =============================================================================

export const ACKNOWLEDGE_COMPLIANCE_ALERT = gql`
  mutation AcknowledgeComplianceAlert($alertId: ID!) {
    acknowledgeComplianceAlert(alertId: $alertId) {
      success
      alertId
    }
  }
`;

export const RESOLVE_COMPLIANCE_ALERT = gql`
  mutation ResolveComplianceAlert($alertId: ID!, $resolutionNotes: String) {
    resolveComplianceAlert(alertId: $alertId, resolutionNotes: $resolutionNotes) {
      success
      alertId
    }
  }
`;

export const DISMISS_COMPLIANCE_ALERT = gql`
  mutation DismissComplianceAlert($alertId: ID!, $reason: String) {
    dismissComplianceAlert(alertId: $alertId, reason: $reason) {
      success
      alertId
    }
  }
`;

// =============================================================================
// Usage Alerts (Anomaly Detection)
// =============================================================================

export const GET_USAGE_ALERTS = gql`
  query GetUsageAlerts(
    $alertType: String
    $severity: String
    $acknowledged: Boolean
    $resolved: Boolean
    $first: Int
    $after: String
  ) {
    usageAlerts(
      alertType: $alertType
      severity: $severity
      acknowledged: $acknowledged
      resolved: $resolved
      first: $first
      after: $after
    ) {
      edges {
        node {
          id
          alertType
          alertTypeDisplay
          severity
          severityDisplay
          title
          message
          details
          thresholdValue
          currentValue
          acknowledged
          acknowledgedAt
          acknowledgedByEmail
          resolved
          resolvedAt
          createdAt
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// =============================================================================
// Monitoring Stats (Dashboard Aggregates)
// =============================================================================

export const GET_MONITORING_STATS = gql`
  query GetMonitoringStats {
    monitoringStats {
      totalInteractions
      interactionsToday
      interactionsThisHour
      totalScans
      scansWithViolations
      scansBlocked
      violationsByType {
        ruleType
        count
      }
      violationsBySeverity {
        severity
        count
      }
      totalTokensToday
      totalCostToday
      avgLatencyMs
      avgScanDurationMs
    }
  }
`;

// =============================================================================
// Events (For Audit Trail)
// =============================================================================

export const GET_EVENTS = gql`
  query GetEvents(
    $eventType: String
    $category: String
    $endpointId: ID
    $userId: String
    $first: Int
    $after: String
  ) {
    events(
      eventType: $eventType
      category: $category
      endpointId: $endpointId
      userId: $userId
      first: $first
      after: $after
    ) {
      edges {
        node {
          id
          eventType
          eventCategory
          status
          payload
          userIdentifier
          endpointName
          correlationId
          occurredAt
          processedAt
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

// =============================================================================
// Content Rule Options (for dropdowns)
// =============================================================================

export const GET_CONTENT_RULE_OPTIONS = gql`
  query GetContentRuleOptions {
    contentRuleOptions {
      ruleTypes {
        value
        label
      }
      severities {
        value
        label
      }
      enforcements {
        value
        label
      }
      scanModes {
        value
        label
      }
      scopeTypes {
        value
        label
      }
    }
  }
`;

// =============================================================================
// Content Rule Mutations
// =============================================================================

export const CREATE_CONTENT_RULE = gql`
  mutation CreateContentRule($input: CreateContentRuleInput!) {
    createContentRule(input: $input) {
      success
      ruleId
      errors
    }
  }
`;

export const UPDATE_CONTENT_RULE = gql`
  mutation UpdateContentRule($input: UpdateContentRuleInput!) {
    updateContentRule(input: $input) {
      success
      ruleId
      errors
    }
  }
`;

export const DELETE_CONTENT_RULE = gql`
  mutation DeleteContentRule($id: ID!) {
    deleteContentRule(id: $id) {
      success
      errors
    }
  }
`;

export const TOGGLE_CONTENT_RULE_ENABLED = gql`
  mutation ToggleContentRuleEnabled($id: ID!, $enabled: Boolean!) {
    toggleContentRuleEnabled(id: $id, enabled: $enabled) {
      success
      ruleId
    }
  }
`;

export const DUPLICATE_CONTENT_RULE = gql`
  mutation DuplicateContentRule($id: ID!, $newName: String) {
    duplicateContentRule(id: $id, newName: $newName) {
      success
      ruleId
      errors
    }
  }
`;

export const TEST_CONTENT_RULE = gql`
  mutation TestContentRule($id: ID!, $testContent: String!) {
    testContentRule(id: $id, testContent: $testContent) {
      success
      matched
      matches
      errors
    }
  }
`;
