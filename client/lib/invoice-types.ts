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
  dateCompleted?: string;
  date: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress?: string;
  deliveryMiles?: number;
  deliveryFee?: number;
  instruments: Instrument[];
  repairDescription: string;
  workDone?: string;
  materials: RepairMaterial[];
  laborHours: number;
  hourlyRate: number;
  notes: string;
  isGeorgesMusic: boolean;
  isNoDeliveryFee?: boolean;
  invoiceHtml: string;
}

export type RepairInvoiceFormData = Omit<RepairInvoice, "materials"> & {
  materialsJson: string;
};
