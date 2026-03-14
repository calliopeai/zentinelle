import { gql } from '@apollo/client';

export const GET_BILLING_OVERVIEW = gql`
  query GetBillingOverview {
    billingOverview {
      currentPlan {
        id
        name
        price
        interval
        features
      }
      subscription {
        id
        status
        currentPeriodStart
        currentPeriodEnd
        cancelAtPeriodEnd
      }
      currentUsage {
        totalSpend
        apiCalls
        agents
        storage
        periodStart
        periodEnd
      }
      paymentMethod {
        id
        brand
        last4
        expMonth
        expYear
      }
      invoices {
        id
        amount
        status
        date
        invoiceUrl
      }
    }
  }
`;

export const GET_USAGE_METRICS = gql`
  query GetUsageMetrics($startDate: DateTime, $endDate: DateTime, $granularity: String) {
    usageMetrics(startDate: $startDate, endDate: $endDate, granularity: $granularity) {
      summary {
        totalApiCalls
        totalTokens
        totalCost
        activeAgents
        storageUsedMb
      }
      timeSeries {
        date
        apiCalls
        tokens
        cost
      }
      byAgent {
        agentId
        agentName
        apiCalls
        tokens
        cost
      }
      byEndpoint {
        endpoint
        apiCalls
        avgLatencyMs
      }
    }
  }
`;

export const GET_SUBSCRIPTION = gql`
  query GetSubscription {
    subscription {
      id
      status
      billingInterval
      plan {
        id
        name
        price
        interval
        features
        limits {
          apiCalls
          agents
          storage
          teamMembers
        }
        monthlyPriceCents
        annualPriceCents
        annualMonthlyPriceCents
        annualSavingsCents
        annualSavingsPercent
        allowsMonthly
      }
      currentPeriodStart
      currentPeriodEnd
      cancelAtPeriodEnd
      trialEnd
      canSwitchToMonthly
      canSwitchToAnnual
      daysUntilPeriodEnd
      # Discount/Coupon info
      activeCoupon {
        id
        code
        name
        discountType
        discountPercent
        discountAmountCents
        duration
        durationMonths
      }
      couponDiscountDisplay
      couponMonthsRemaining
      hasActiveDiscount
      # Effective pricing
      listMonthlyPriceCents
      effectiveMonthlyPriceCents
      discountAmountCents
      discountPercent
      # Partner/Enterprise info
      partnerName
      partnerTier
      isEnterprise
      contractEndDate
    }
  }
`;

export const GET_AVAILABLE_PLANS = gql`
  query GetAvailablePlans {
    availablePlans {
      id
      name
      description
      price
      interval
      features
      limits {
        apiCalls
        agents
        storage
        teamMembers
      }
      recommended
      monthlyPriceCents
      annualPriceCents
      annualMonthlyPriceCents
      annualSavingsCents
      annualSavingsPercent
      allowsMonthly
    }
  }
`;

export const UPDATE_SUBSCRIPTION = gql`
  mutation UpdateSubscription($planId: ID!) {
    updateSubscription(planId: $planId) {
      subscription {
        id
        status
        plan {
          id
          name
        }
      }
      errors
    }
  }
`;

export const CHANGE_BILLING_INTERVAL = gql`
  mutation ChangeBillingInterval($billingInterval: String!) {
    changeBillingInterval(input: { billingInterval: $billingInterval }) {
      subscription {
        id
        status
        billingInterval
        currentPeriodStart
        currentPeriodEnd
        canSwitchToMonthly
        canSwitchToAnnual
        daysUntilPeriodEnd
        plan {
          id
          name
          monthlyPriceCents
          annualPriceCents
          annualMonthlyPriceCents
        }
      }
      errors
    }
  }
`;

export const CANCEL_SUBSCRIPTION = gql`
  mutation CancelSubscription($immediately: Boolean) {
    cancelSubscription(immediately: $immediately) {
      subscription {
        id
        status
        cancelAtPeriodEnd
      }
      errors
    }
  }
`;

export const UPDATE_PAYMENT_METHOD = gql`
  mutation UpdatePaymentMethod($paymentMethodId: String!) {
    updatePaymentMethod(paymentMethodId: $paymentMethodId) {
      paymentMethod {
        id
        brand
        last4
      }
      errors
    }
  }
`;

export const CREATE_PORTAL_SESSION = gql`
  mutation CreatePortalSession($returnUrl: String) {
    createPortalSession(returnUrl: $returnUrl) {
      portalUrl
      errors
    }
  }
`;

export const REACTIVATE_SUBSCRIPTION = gql`
  mutation ReactivateSubscription {
    reactivateSubscription(input: {}) {
      subscription {
        id
        status
        cancelAtPeriodEnd
      }
      errors
    }
  }
`;

// =============================================================================
// AI Usage & Budget Queries
// =============================================================================

export const GET_AI_USAGE_SUMMARY = gql`
  query GetAIUsageSummary($organizationId: UUID!, $deploymentId: UUID, $days: Int) {
    aiUsageSummary(organizationId: $organizationId, deploymentId: $deploymentId, days: $days) {
      periodStart
      periodEnd
      totalRequests
      totalTokens
      totalInputTokens
      totalOutputTokens
      totalCostUsd
      byProvider {
        provider
        providerDisplay
        totalRequests
        totalTokens
        totalCostUsd
      }
      byUser {
        userIdentifier
        totalRequests
        totalTokens
        totalCostUsd
      }
      byModel {
        provider
        model
        totalRequests
        totalTokens
        totalCostUsd
      }
      topUsers {
        userIdentifier
        totalRequests
        totalTokens
        totalCostUsd
      }
      recentRecords {
        id
        userIdentifier
        provider
        providerDisplay
        model
        requestType
        inputTokens
        outputTokens
        totalTokens
        inputCostUsd
        outputCostUsd
        totalCostUsd
        latencyMs
        timestamp
      }
    }
  }
`;

export const GET_AI_BUDGET_STATUS = gql`
  query GetAIBudgetStatus($organizationId: UUID!) {
    aiBudgetStatus(organizationId: $organizationId) {
      budgetUsd
      spentUsd
      remainingUsd
      percentageUsed
      hasBudget
      isExceeded
      shouldBlock
      overagePolicy
      overagePolicyDisplay
      hasPaymentMethod
      alertThreshold
      alertSent
      periodStart
      providerLimits
    }
  }
`;

// =============================================================================
// Add-ons Queries
// =============================================================================

export const GET_ADDONS = gql`
  query GetAddons($addonType: String, $billingType: String, $activeOnly: Boolean) {
    addons(addonType: $addonType, billingType: $billingType, activeOnly: $activeOnly) {
      id
      name
      addonType
      billingType
      description
      price
      priceCents
      unitLabel
      quantity
      overageRate
      requiresAnnual
      isActive
      sortOrder
      availableForPlanTypes
    }
  }
`;

export const GET_SUPPORT_ADDONS = gql`
  query GetSupportAddons {
    addons(activeOnly: true) {
      id
      name
      addonType
      billingType
      description
      price
      priceCents
      unitLabel
      requiresAnnual
      availableForPlanTypes
      sortOrder
    }
  }
`;

export const GET_ORGANIZATION_ADDONS = gql`
  query GetOrganizationAddons {
    organizationAddons {
      id
      name
      addonType
      billingType
      description
      price
      priceCents
      unitLabel
      quantity
      overageRate
      isActive
    }
  }
`;

// =============================================================================
// Invoice Queries
// =============================================================================

export const GET_INVOICES = gql`
  query GetInvoices($limit: Int, $offset: Int, $status: String) {
    invoices(limit: $limit, offset: $offset, status: $status) {
      id
      status
      amountDue
      amountPaid
      currency
      periodStart
      periodEnd
      amount
      date
      invoiceUrl
    }
  }
`;

// =============================================================================
// Coupon Queries & Mutations
// =============================================================================

export const VALIDATE_COUPON = gql`
  mutation ValidateCoupon($code: String!, $planId: UUID) {
    validateCoupon(code: $code, planId: $planId) {
      success
      error
      coupon {
        id
        code
        name
        discountType
        discountPercent
        discountAmountCents
        duration
        durationMonths
        isValid
        isFreeTrial
        freeMonths
        discountDisplay
        durationDisplay
      }
    }
  }
`;

export const VALIDATE_COUPON_CODE = gql`
  query ValidateCouponCode($code: String!, $planId: UUID) {
    validateCouponCode(code: $code, planId: $planId) {
      isValid
      error
      coupon {
        id
        code
        name
        discountType
        discountPercent
        discountAmountCents
        duration
        durationMonths
        isFreeTrial
        freeMonths
        discountDisplay
        durationDisplay
      }
    }
  }
`;

export const GET_COUPONS = gql`
  query GetCoupons($status: String, $partnerId: UUID, $isFreeTrial: Boolean, $limit: Int, $offset: Int) {
    coupons(status: $status, partnerId: $partnerId, isFreeTrial: $isFreeTrial, limit: $limit, offset: $offset) {
      items {
        id
        pk
        code
        name
        discountType
        discountPercent
        discountAmountCents
        duration
        durationMonths
        firstTimeOnly
        maxRedemptions
        maxRedemptionsPerOrg
        timesRedeemed
        status
        validFrom
        validUntil
        campaign
        isValid
        isFreeTrial
        freeMonths
        discountDisplay
        durationDisplay
        partnerId
        partnerName
        stripeCouponId
        stripePromoCodeId
        createdAt
      }
      totalCount
    }
  }
`;

export const GET_COUPON = gql`
  query GetCoupon($id: UUID, $code: String) {
    coupon(id: $id, code: $code) {
      id
      pk
      code
      name
      discountType
      discountPercent
      discountAmountCents
      duration
      durationMonths
      firstTimeOnly
      maxRedemptions
      maxRedemptionsPerOrg
      timesRedeemed
      status
      validFrom
      validUntil
      campaign
      notes
      isValid
      isFreeTrial
      freeMonths
      discountDisplay
      durationDisplay
      applicablePlanIds
      partnerId
      partnerName
      stripeCouponId
      stripePromoCodeId
      createdAt
    }
  }
`;

export const CREATE_COUPON = gql`
  mutation CreateCoupon(
    $code: String!
    $name: String!
    $discountType: String!
    $discountPercent: Int
    $discountAmountCents: Int
    $duration: String!
    $durationMonths: Int
    $applicablePlanIds: [UUID]
    $maxRedemptions: Int
    $maxRedemptionsPerOrg: Int
    $firstTimeOnly: Boolean
    $validFrom: DateTime
    $validUntil: DateTime
    $partnerId: UUID
    $campaign: String
    $notes: String
    $syncToStripe: Boolean
  ) {
    createCoupon(
      code: $code
      name: $name
      discountType: $discountType
      discountPercent: $discountPercent
      discountAmountCents: $discountAmountCents
      duration: $duration
      durationMonths: $durationMonths
      applicablePlanIds: $applicablePlanIds
      maxRedemptions: $maxRedemptions
      maxRedemptionsPerOrg: $maxRedemptionsPerOrg
      firstTimeOnly: $firstTimeOnly
      validFrom: $validFrom
      validUntil: $validUntil
      partnerId: $partnerId
      campaign: $campaign
      notes: $notes
      syncToStripe: $syncToStripe
    ) {
      success
      errors
      coupon {
        id
        code
        name
        stripeCouponId
        stripePromoCodeId
      }
      stripeSynced
      stripeSyncError
    }
  }
`;

export const CREATE_FREE_TRIAL_COUPON = gql`
  mutation CreateFreeTrialCoupon(
    $code: String!
    $name: String!
    $months: Int!
    $maxRedemptions: Int
    $validUntil: DateTime
    $applicablePlanIds: [UUID]
    $partnerId: UUID
    $campaign: String
    $syncToStripe: Boolean
  ) {
    createFreeTrialCoupon(
      code: $code
      name: $name
      months: $months
      maxRedemptions: $maxRedemptions
      validUntil: $validUntil
      applicablePlanIds: $applicablePlanIds
      partnerId: $partnerId
      campaign: $campaign
      syncToStripe: $syncToStripe
    ) {
      success
      errors
      coupon {
        id
        code
        name
        discountDisplay
        durationDisplay
        stripeCouponId
        stripePromoCodeId
      }
      stripeSynced
      stripeSyncError
    }
  }
`;

export const UPDATE_COUPON = gql`
  mutation UpdateCoupon(
    $couponId: UUID!
    $name: String
    $status: String
    $maxRedemptions: Int
    $validUntil: DateTime
    $notes: String
  ) {
    updateCoupon(
      couponId: $couponId
      name: $name
      status: $status
      maxRedemptions: $maxRedemptions
      validUntil: $validUntil
      notes: $notes
    ) {
      success
      errors
      coupon {
        id
        code
        name
        status
      }
    }
  }
`;

export const SYNC_COUPON_TO_STRIPE = gql`
  mutation SyncCouponToStripe($couponId: UUID!) {
    syncCouponToStripe(couponId: $couponId) {
      success
      errors
      message
      coupon {
        id
        code
        stripeCouponId
        stripePromoCodeId
      }
    }
  }
`;
