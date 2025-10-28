export interface RepairMaterial {
  description: string;
  quantity: number;
  unitCost: number;
}

export interface RepairInvoice {
  invoiceNumber: string;
  date: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  instrumentType: string;
  instrumentDescription: string;
  repairDescription: string;
  materials: RepairMaterial[];
  laborHours: number;
  hourlyRate: number;
  notes: string;
}

export type RepairInvoiceFormData = Omit<RepairInvoice, 'materials'> & {
  materialsJson: string;
};
