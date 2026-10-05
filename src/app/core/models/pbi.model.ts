export interface PbiItem {
  id: number;
  title: string;
  description: string;
  acceptanceCriteria: string;
  state?: string;
  assignedTo?: string;
  url?: string;
}
