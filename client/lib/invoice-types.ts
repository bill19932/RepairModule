export interface RepairMaterial {
  description: string;
  quantity: number;
  unitCost: number;
}

export interface Instrument {
  type: string;
  description: string;
}

export interface RepairInvoice {
  invoiceNumber: string;
  dateReceived: string;
  date: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  instruments: Instrument[];
  repairDescription: string;
  materials: RepairMaterial[];
  laborHours: number;
  hourlyRate: number;
  notes: string;
  isGeorgesMusic: boolean;
  invoiceHtml: string;
}

export type RepairInvoiceFormData = Omit<RepairInvoice, 'materials'> & {
  materialsJson: string;
};
