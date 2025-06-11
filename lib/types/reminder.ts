export interface Reminder {
  title: string;
  _id?: string;
  license_plate: string;
  reminder_type: string;
  due_date: string | Date;
  description?: string;
  status?: "due" | "not due";
}
