export interface User {
  id: string;
  name: string | null;
  email: string;
  profile_image_url: string | null;
  current_credit_balance: number;
  miscellaneous_credit_spent: number;
}
