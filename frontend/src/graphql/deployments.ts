import { gql } from '@apollo/client';

export const GET_DEPLOYMENTS = gql`
  query GetDeployments($search: String, $environment: String, $first: Int, $after: String, $globalView: Boolean) {
    deployments(search: $search, environment: $environment, first: $first, after: $after, globalView: $globalView) {
      edges {
        node {
          id
          name
          slug
          description
          environment
          environmentDisplay
          deploymentType
          deploymentTypeDisplay
          hostingModel
          hostingModelDisplay
          hubUrl
          cloudRegion
          cloudProvider
          status
          statusDisplay
          endpointCount
          activeEndpointCount
          lastDeployedAt
          lastHealthyAt
          createdAt
          updatedAt
          cachedStatus
          cachedStatusAt
        }
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
`;

export const GET_DEPLOYMENT = gql`
  query GetDeployment($id: ID!) {
    deployment(id: $id) {
      id
      name
      slug
      description
      environment
      environmentDisplay
      deploymentType
      deploymentTypeDisplay
      hostingModel
      hostingModelDisplay
      hubUrl
      cloudRegion
      cloudProvider
      status
      statusDisplay
      endpointCount
      activeEndpointCount
      lastDeployedAt
      lastHealthyAt
      lastConnectedAt
      agentVersion
      config
      createdAt
      updatedAt
      onboardingId
      cachedStatus
      cachedStatusAt
    }
  }
`;

export const CREATE_DEPLOYMENT = gql`
  mutation CreateDeployment($organizationId: ID!, $input: CreateDeploymentInput!) {
    createDeployment(organizationId: $organizationId, input: $input) {
      deployment {
        id
        name
        slug
        environment
        environmentDisplay
        status
        statusDisplay
        hubUrl
      }
      success
      error
    }
  }
`;

export const UPDATE_DEPLOYMENT = gql`
  mutation UpdateDeployment($input: UpdateDeploymentInput!) {
    updateDeployment(input: $input) {
      deployment {
        id
        name
        slug
        description
        environment
        status
      }
      success
      error
    }
  }
`;

export const DELETE_DEPLOYMENT = gql`
  mutation DeleteDeployment($id: ID!) {
    deleteDeployment(id: $id) {
      success
      error
    }
  }
`;

// =============================================================================
// Deployment Operations (Infrastructure Management)
// =============================================================================

export const RESTART_DEPLOYMENT = gql`
  mutation RestartDeployment($deploymentId: ID!, $reason: String, $force: Boolean) {
    restartDeployment(deploymentId: $deploymentId, reason: $reason, force: $force) {
      result {
        success
        message
        deploymentId
        triggeredAt
      }
      deployment {
        id
        status
        statusDisplay
      }
    }
  }
`;

export const SCALE_DEPLOYMENT = gql`
  mutation ScaleDeployment($deploymentId: ID!, $desiredCount: Int!) {
    scaleDeployment(deploymentId: $deploymentId, desiredCount: $desiredCount) {
      result {
        success
        message
        previousCount
        desiredCount
      }
      deployment {
        id
        status
      }
    }
  }
`;

export const SYNC_DEPLOYMENT = gql`
  mutation SyncDeployment($deploymentId: ID!, $direction: String!, $restartAfter: Boolean) {
    syncDeployment(deploymentId: $deploymentId, direction: $direction, restartAfter: $restartAfter) {
      result {
        success
        message
        direction
        syncedAt
        driftDetected
        changes
      }
      deployment {
        id
        status
      }
    }
  }
`;

export const GET_DEPLOYMENT_STATUS = gql`
  mutation GetDeploymentStatus($deploymentId: ID!) {
    getDeploymentStatus(deploymentId: $deploymentId) {
      result {
        success
        error
        deploymentId
        state
        runningCount
        desiredCount
        pendingCount
        deploymentState
        lastDeploymentAt
        driftDetected
        configInSync
        secretsHealthy
        metrics {
          cpuPercent
          memoryPercent
          memoryMb
          runningCount
          desiredCount
          collectedAt
        }
      }
    }
  }
`;

export const GET_DEPLOYMENT_LOGS = gql`
  mutation GetDeploymentLogs($deploymentId: ID!, $lines: Int, $container: String) {
    getDeploymentLogs(deploymentId: $deploymentId, lines: $lines, container: $container) {
      result {
        success
        error
        logs {
          timestamp
          message
          container
          stream
        }
      }
    }
  }
`;

export const CHECK_DEPLOYMENT_DRIFT = gql`
  mutation CheckDeploymentDrift($deploymentId: ID!, $includeTerraform: Boolean) {
    checkDeploymentDrift(deploymentId: $deploymentId, includeTerraform: $includeTerraform) {
      result {
        success
        error
        driftDetected
        configDrift
        secretsDrift
        desiredConfigHash
        lastConfigHash
        desiredSecretsHash
        lastSecretsHash
        driftDetectedAt
        terraformDrift
        terraformResourcesToAdd
        terraformResourcesToChange
        terraformResourcesToDestroy
        terraformDriftSummary
      }
      deployment {
        id
        status
      }
    }
  }
`;

export const CLEAR_DEPLOYMENT_DRIFT = gql`
  mutation ClearDeploymentDrift($deploymentId: ID!) {
    clearDeploymentDrift(deploymentId: $deploymentId) {
      success
      error
      deployment {
        id
        status
      }
    }
  }
`;

// JunoHub Configuration Operations

export const GET_JUNOHUB_CONFIG = gql`
  query GetJunoHubConfig($deploymentId: ID!) {
    deployment(id: $deploymentId) {
      id
      name
      junohubConfigs {
        edges {
          node {
            id
            name
            slug
            environment
            environmentDisplay
            platform
            platformDisplay
            instanceIdleTimeoutHours
            instanceMaxRuntimeHours
            allowUserInstanceProtection
            isActive
            lastDeployedAt
            lastSyncedAt
            createdAt
            updatedAt
          }
        }
      }
    }
  }
`;

export const UPDATE_JUNOHUB_CONFIG = gql`
  mutation UpdateJunoHubConfig($input: UpdateJunoHubConfigInput!) {
    updateJunohubConfig(input: $input) {
      config {
        id
        name
        instanceIdleTimeoutHours
        instanceMaxRuntimeHours
        allowUserInstanceProtection
        lastSyncedAt
      }
      success
      error
    }
  }
`;

export const SYNC_JUNOHUB_SECRETS = gql`
  mutation SyncJunoHubSecrets($configId: ID!, $secrets: JSONString!) {
    syncJunohubSecrets(configId: $configId, secrets: $secrets) {
      secretsArn
      success
      error
    }
  }
`;

// =============================================================================
// Cognito User Sync Operations
// =============================================================================

export const DIFF_COGNITO_USERS = gql`
  mutation DiffCognitoUsers($deploymentId: ID!) {
    diffCognitoUsers(deploymentId: $deploymentId) {
      success
      deploymentId
      deploymentName
      totalInClientCove
      totalInCognito
      onlyInClientCove
      onlyInCognito
      inSync
      roleMismatch
      statusMismatch
      entries {
        email
        username
        inClientCove
        inCognito
        clientCoveRole
        cognitoRole
        clientCoveStatus
        cognitoEnabled
        diffType
      }
      error
    }
  }
`;

export const IMPORT_COGNITO_USERS = gql`
  mutation ImportCognitoUsers($deploymentId: ID!, $dryRun: Boolean) {
    importCognitoUsers(deploymentId: $deploymentId, dryRun: $dryRun) {
      success
      total
      created
      updated
      skipped
      failed
      results {
        success
        action
        username
        email
        cognitoSub
        userId
        memberId
        error
      }
      errors
    }
  }
`;

export const PUSH_COGNITO_USERS = gql`
  mutation PushCognitoUsers($deploymentId: ID!) {
    pushCognitoUsers(deploymentId: $deploymentId) {
      success
      total
      created
      enabled
      disabled
      skipped
      failed
      results {
        success
        action
        username
        email
        deploymentId
        cognitoSub
        error
        temporaryPassword
      }
      errors
    }
  }
`;

export const SYNC_COGNITO_BIDIRECTIONAL = gql`
  mutation SyncCognitoBidirectional($deploymentId: ID!, $dryRun: Boolean) {
    syncCognitoBidirectional(deploymentId: $deploymentId, dryRun: $dryRun) {
      success
      pullTotal
      pullCreated
      pullSkipped
      pullFailed
      pushTotal
      pushCreated
      pushSkipped
      pushFailed
      errors
    }
  }
`;

export const ADD_MISSING_COGNITO_USERS = gql`
  mutation AddMissingCognitoUsers($deploymentId: ID!) {
    addMissingCognitoUsers(deploymentId: $deploymentId) {
      success
      addedToCognito
      addedToClientCove
      errors
    }
  }
`;

// =============================================================================
// JunoHub Usage Metrics
// =============================================================================

export const GET_JUNOHUB_USAGE = gql`
  query GetJunoHubUsage($deploymentId: UUID!, $days: Int) {
    junohubUsage(deploymentId: $deploymentId, days: $days) {
      deploymentId
      deploymentName
      lastReportedAt
      summary {
        periodStart
        periodEnd
        activeSpawns
        totalSpawns
        uniqueUsers
        peakConcurrentSpawns
        computeHoursTotal
        computeHoursSmall
        computeHoursMedium
        computeHoursLarge
        computeHoursXlarge
        computeHoursGpu
        toolUsage {
          toolType
          spawnCount
          activeCount
        }
        activeUserList
      }
      timeSeries {
        date
        activeSpawns
        spawnCount
        uniqueUsers
        computeHours
      }
    }
  }
`;

// =============================================================================
// Config Push/Sync Operations (Issue #96)
// =============================================================================

export const PUSH_DEPLOYMENT_CONFIG = gql`
  mutation PushDeploymentConfig(
    $deploymentId: ID!
    $syncAiKeys: Boolean
    $syncDataSources: Boolean
    $syncDeploymentConfig: Boolean
    $restartAfter: Boolean
  ) {
    pushDeploymentConfig(
      deploymentId: $deploymentId
      syncAiKeys: $syncAiKeys
      syncDataSources: $syncDataSources
      syncDeploymentConfig: $syncDeploymentConfig
      restartAfter: $restartAfter
    ) {
      result {
        success
        message
        direction
        syncedAt
        driftDetected
        changes
      }
      deployment {
        id
        status
        statusDisplay
      }
    }
  }
`;

// Config Diff Query - compares desired (Client Cove) vs actual (JunoHub) config
export const GET_DEPLOYMENT_CONFIG_DIFF = gql`
  query GetDeploymentConfigDiff($deploymentId: UUID!) {
    deploymentConfigDiff(deploymentId: $deploymentId) {
      success
      error
      deploymentId
      deploymentName
      totalChanges
      addedCount
      removedCount
      modifiedCount
      hasDrift
      comparedAt
      diffs {
        field
        desiredValue
        actualValue
        changeType
        isSensitive
      }
    }
  }
`;

// Config Audit History Query - tracks who changed what and when
export const GET_DEPLOYMENT_CONFIG_AUDIT = gql`
  query GetDeploymentConfigAudit($deploymentId: UUID!, $first: Int, $after: String, $source: String) {
    deploymentConfigAudits(deploymentId: $deploymentId, first: $first, after: $after, source: $source) {
      edges {
        node {
          id
          changeType
          fieldName
          previousValue
          newValue
          changedAt
          source
          reason
          batchId
          isSensitive
          changedBy {
            id
            email
            fullName
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

// =============================================================================
// Per-User Runtime Limit Overrides
// =============================================================================

export const GET_USER_RUNTIME_OVERRIDES = gql`
  query GetUserRuntimeOverrides($deploymentId: UUID!) {
    userRuntimeOverrides(deploymentId: $deploymentId) {
      id
      idleTimeoutHours
      maxRuntimeHours
      allowInstanceProtection
      runForever
      reason
      isActive
      userEmail
      userFullName
      effectiveIdleTimeout
      effectiveMaxRuntime
      effectiveProtection
      createdAt
      updatedAt
    }
  }
`;

export const GET_MY_RUNTIME_LIMITS = gql`
  query GetMyRuntimeLimits($deploymentId: UUID!) {
    myRuntimeLimits(deploymentId: $deploymentId) {
      id
      idleTimeoutHours
      maxRuntimeHours
      allowInstanceProtection
      runForever
      effectiveIdleTimeout
      effectiveMaxRuntime
      effectiveProtection
    }
  }
`;

export const SET_USER_RUNTIME_OVERRIDE = gql`
  mutation SetUserRuntimeOverride($input: SetUserRuntimeOverrideInput!) {
    setUserRuntimeOverride(input: $input) {
      override {
        id
        idleTimeoutHours
        maxRuntimeHours
        allowInstanceProtection
        runForever
        reason
        userEmail
        userFullName
        effectiveIdleTimeout
        effectiveMaxRuntime
        effectiveProtection
      }
      success
      error
    }
  }
`;

export const REMOVE_USER_RUNTIME_OVERRIDE = gql`
  mutation RemoveUserRuntimeOverride($id: ID!) {
    removeUserRuntimeOverride(id: $id) {
      success
      error
    }
  }
`;

// =============================================================================
// Deployment Cloning
// =============================================================================

export const CLONE_DEPLOYMENT = gql`
  mutation CloneDeployment($sourceDeploymentId: ID!, $input: CloneDeploymentInput!) {
    cloneDeployment(sourceDeploymentId: $sourceDeploymentId, input: $input) {
      deployment {
        id
        name
        slug
        environment
        environmentDisplay
        status
        statusDisplay
        hubUrl
      }
      success
      error
      clonedConfigs
    }
  }
`;

// =============================================================================
// ECS Exec Troubleshooting Operations (#135)
// =============================================================================

export const EXECUTE_COMMAND = gql`
  mutation ExecuteCommand($deploymentId: ID!, $containerName: String!, $command: String!) {
    executeCommand(deploymentId: $deploymentId, containerName: $containerName, command: $command) {
      result {
        success
        message
        session {
          id
          deploymentId
          containerName
          containerNameDisplay
          command
          output
          exitCode
          status
          statusDisplay
          errorMessage
          createdByEmail
          createdAt
          startedAt
          completedAt
          durationSeconds
          taskId
        }
      }
    }
  }
`;

export const GET_EXEC_SESSION = gql`
  mutation GetExecSession($sessionId: UUID!) {
    getExecSession(sessionId: $sessionId) {
      result {
        success
        message
        session {
          id
          deploymentId
          containerName
          containerNameDisplay
          command
          output
          exitCode
          status
          statusDisplay
          errorMessage
          createdByEmail
          createdAt
          startedAt
          completedAt
          durationSeconds
          taskId
        }
      }
    }
  }
`;

export const GET_EXEC_SESSIONS = gql`
  mutation GetExecSessions($deploymentId: ID!, $limit: Int, $statusFilter: String) {
    getExecSessions(deploymentId: $deploymentId, limit: $limit, statusFilter: $statusFilter) {
      result {
        success
        error
        totalCount
        sessions {
          id
          deploymentId
          containerName
          containerNameDisplay
          command
          output
          exitCode
          status
          statusDisplay
          errorMessage
          createdByEmail
          createdAt
          startedAt
          completedAt
          durationSeconds
        }
      }
    }
  }
`;

// =============================================================================
// Config Snapshots (Version History & Rollback - Issue #129)
// =============================================================================

export const GET_DEPLOYMENT_CONFIG_SNAPSHOTS = gql`
  query GetDeploymentConfigSnapshots($deploymentId: UUID!, $first: Int, $after: String) {
    deploymentConfigSnapshots(deploymentId: $deploymentId, first: $first, after: $after) {
      edges {
        node {
          id
          version
          description
          snapshotType
          snapshotTypeDisplay
          snapshotAt
          configHash
          createdByEmail
          changesFromCurrent
          configData
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

export const GET_CONFIG_SNAPSHOT_DIFF = gql`
  query GetConfigSnapshotDiff($snapshotId: ID!) {
    deploymentConfigSnapshotDiff(snapshotId: $snapshotId) {
      field
      snapshotValue
      currentValue
      changeType
    }
  }
`;

export const CREATE_CONFIG_SNAPSHOT = gql`
  mutation CreateConfigSnapshot($deploymentId: ID!, $description: String) {
    createConfigSnapshot(deploymentId: $deploymentId, description: $description) {
      snapshot {
        id
        version
        description
        snapshotType
        snapshotAt
        configHash
      }
      success
      error
    }
  }
`;

export const ROLLBACK_CONFIG_SNAPSHOT = gql`
  mutation RollbackConfigSnapshot($snapshotId: ID!, $pushAfter: Boolean) {
    rollbackConfigSnapshot(snapshotId: $snapshotId, pushAfter: $pushAfter) {
      result {
        success
        message
        snapshotVersion
        fieldsRestored
        pushTriggered
        newSnapshotVersion
      }
      deployment {
        id
        status
        statusDisplay
      }
    }
  }
`;

// =============================================================================
// Instance Protection Management (Issue #159)
// =============================================================================

export const GET_ACTIVE_INSTANCES = gql`
  mutation GetActiveInstances($deploymentId: ID!) {
    getActiveInstances(deploymentId: $deploymentId) {
      result {
        success
        error
        totalCount
        instances {
          user
          serverName
          ready
          started
          lastActivity
          url
          protectFromCulling
        }
      }
    }
  }
`;

export const TOGGLE_INSTANCE_PROTECTION = gql`
  mutation ToggleInstanceProtection($deploymentId: ID!, $username: String!, $serverName: String, $protect: Boolean!) {
    toggleInstanceProtection(deploymentId: $deploymentId, username: $username, serverName: $serverName, protect: $protect) {
      result {
        success
        message
        error
        user
        serverName
        protectFromCulling
      }
    }
  }
`;

// =============================================================================
// Hub Health Monitoring (Issue #161)
// =============================================================================

export const GET_HUB_HEALTH = gql`
  query GetHubHealth($deploymentId: UUID!, $days: Int) {
    hubHealth(deploymentId: $deploymentId, days: $days) {
      success
      error
      hubUrl
      hubReachable
      checkedAt
      buildInfo {
        gitHash
        buildTime
        buildId
        environment
        buildSignature
        hubVersion
        success
        error
      }
      configStatus {
        configHash
        lastUpdated
        lastPushed
        pushedFields
        configSource
        success
        error
      }
      runningCount
      desiredCount
      serviceState
      usageTrends {
        date
        activeUsers
        computeHours
        sessions
      }
      totalActiveUsers
      totalComputeHours
      totalSessions
    }
  }
`;

// Pull config mutation - fetches current config from JunoHub and optionally imports
export const PULL_DEPLOYMENT_CONFIG = gql`
  mutation PullDeploymentConfig($deploymentId: ID!, $importChanges: Boolean, $force: Boolean) {
    pullDeploymentConfig(deploymentId: $deploymentId, importChanges: $importChanges, force: $force) {
      result {
        success
        message
        deploymentId
        pulledAt
        changesDetected
        imported
        auditBatchId
        diffs {
          field
          desiredValue
          actualValue
          changeType
          isSensitive
        }
      }
      deployment {
        id
        status
        statusDisplay
      }
    }
  }
`;
