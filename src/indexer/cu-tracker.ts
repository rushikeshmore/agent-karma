import { CU_COSTS, MONTHLY_CU_BUDGET, CU_WARNING_THRESHOLD } from '../config/constants.js'

let sessionCUs = 0
const methodCounts: Record<string, number> = {}
let budgetExceeded = false

/**
 * Track CU usage for an RPC method call.
 * Warns at 80% of monthly budget, sets budgetExceeded at 90%.
 */
export function trackCU(method: string, count = 1): void {
  const costPer = CU_COSTS[method] ?? 50
  const totalCost = costPer * count
  sessionCUs += totalCost
  methodCounts[method] = (methodCounts[method] ?? 0) + count

  const pct = sessionCUs / MONTHLY_CU_BUDGET
  if (pct >= 0.9 && !budgetExceeded) {
    budgetExceeded = true
    console.error(
      `[CU ABORT] 90% of monthly budget reached! ` +
      `(${sessionCUs.toLocaleString()} / ${MONTHLY_CU_BUDGET.toLocaleString()}) — indexers should stop.`
    )
  } else if (pct >= CU_WARNING_THRESHOLD) {
    console.warn(
      `[CU WARNING] ${(pct * 100).toFixed(1)}% of monthly budget ` +
      `(${sessionCUs.toLocaleString()} / ${MONTHLY_CU_BUDGET.toLocaleString()})`
    )
  }
}

/**
 * Check if indexers should stop to protect the free tier budget.
 * Returns true if session CU usage has hit 90% of monthly budget.
 */
export function shouldStop(): boolean {
  return budgetExceeded
}

export function getCUUsage() {
  return {
    totalCUs: sessionCUs,
    budget: MONTHLY_CU_BUDGET,
    percent: `${((sessionCUs / MONTHLY_CU_BUDGET) * 100).toFixed(2)}%`,
    methods: { ...methodCounts },
  }
}

export function resetCUUsage() {
  sessionCUs = 0
  budgetExceeded = false
  for (const key of Object.keys(methodCounts)) delete methodCounts[key]
}
