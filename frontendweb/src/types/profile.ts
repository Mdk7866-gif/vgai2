/** Mirrors app/schemas/payment.py's CreditTopup / PaymentHistoryResponse and
 *  app/schemas/profile.py's ProjectUsageRecord / UsageHistoryResponse. */

export type PaymentStatus = "pending" | "success" | "failed" | "refunded";

export interface CreditTopup {
  id: string;
  razorpay_order_id: string;
  razorpay_payment_id: string | null;
  amount_paid: number;
  currency: string;
  credits_added: number;
  credits_balance_after: number;
  payment_status: PaymentStatus;
  created_at: string;
  updated_at: string;
}

export interface PaymentHistoryResponse {
  /** Includes pending/failed attempts; only successful ones feed the totals. */
  topups: CreditTopup[];
  grants: AdminCreditGrant[];
  total_amount_paid: number;
  total_credits_purchased: number;
  total_credits_granted: number;
}

export interface AdminCreditGrant {
  id: string;
  credits_granted: number;
  credits_balance_after: number;
  /** Admin-provided explanation, shown verbatim to the account owner. */
  reason: string | null;
  /** "welcome" is the automatic first-login bonus; "admin" is support-added credit. */
  grant_kind: "admin" | "welcome";
  created_at: string;
}

export interface ProjectUsageRecord {
  project_id: string;
  project_name: string;
  /** False once the project itself is deleted — its spend row outlives it. */
  project_exists: boolean;

  llm_credit_spent: number;
  image_credit_spent: number;
  animation_credit_spent: number;
  voiceover_credit_spent: number;
  total_credit_spent: number;

  /** Null for deleted projects, where only first_spend_at is still known. */
  project_created_at: string | null;
  first_spend_at: string;
}

export interface UsageHistoryResponse {
  projects: ProjectUsageRecord[];

  /** Lifetime spend — the five sub-totals below add up to exactly this. */
  total_credit_spent: number;
  total_llm_credit_spent: number;
  total_image_credit_spent: number;
  total_animation_credit_spent: number;
  total_voiceover_credit_spent: number;
  total_miscellaneous_credit_spent: number;
}
