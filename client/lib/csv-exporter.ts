import { RepairInvoice } from './invoice-types';

export const generateCSVRow = (invoice: RepairInvoice): string => {
  const servicesTotal = invoice.materials.reduce((sum, mat) => sum + (mat.quantity * mat.unitCost), 0);
  const subtotal = servicesTotal;
  const tax = subtotal * 0.06;
  const total = subtotal + tax;

  const fields = [
    invoice.invoiceNumber,
    invoice.date,
    invoice.customerName,
    invoice.customerPhone,
    invoice.customerEmail,
    invoice.instrumentType,
    invoice.instrumentDescription,
    invoice.repairDescription.replace(/"/g, '""').replace(/\n/g, ' '),
    invoice.materials.map(m => `${m.description} (${m.quantity} @ $${m.unitCost})`).join('; '),
    invoice.laborHours,
    invoice.hourlyRate,
    materialsTotal.toFixed(2),
    laborTotal.toFixed(2),
    subtotal.toFixed(2),
    tax.toFixed(2),
    total.toFixed(2),
    invoice.notes.replace(/"/g, '""').replace(/\n/g, ' '),
  ];

  return fields.map(field => `"${field}"`).join(',');
};

export const getCSVHeaders = (): string => {
  const headers = [
    'Invoice Number',
    'Date',
    'Customer Name',
    'Customer Phone',
    'Customer Email',
    'Instrument Type',
    'Instrument Description',
    'Repair Description',
    'Materials',
    'Labor Hours',
    'Hourly Rate',
    'Materials Total',
    'Labor Total',
    'Subtotal',
    'Tax',
    'Total',
    'Notes',
  ];

  return headers.map(h => `"${h}"`).join(',');
};

export const downloadCSV = (invoices: RepairInvoice[]) => {
  let csv = getCSVHeaders() + '\n';
  csv += invoices.map(invoice => generateCSVRow(invoice)).join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', `delco-music-invoices-${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const addInvoiceToLocalStorage = (invoice: RepairInvoice) => {
  const invoices: RepairInvoice[] = JSON.parse(localStorage.getItem('delco-invoices') || '[]');
  invoices.push(invoice);
  localStorage.setItem('delco-invoices', JSON.stringify(invoices));
};

export const getAllInvoicesFromLocalStorage = (): RepairInvoice[] => {
  return JSON.parse(localStorage.getItem('delco-invoices') || '[]');
};

export const exportAllInvoicesToCSV = () => {
  const invoices = getAllInvoicesFromLocalStorage();
  if (invoices.length === 0) {
    alert('No invoices to export. Create some invoices first!');
    return;
  }
  downloadCSV(invoices);
};
