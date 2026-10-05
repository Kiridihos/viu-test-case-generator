export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: string;
  photoURL?: string | null;
}
