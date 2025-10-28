import { RepairInvoice } from './invoice-types';

export const generateCSVRow = (invoice: RepairInvoice): string => {
  const servicesTotal = invoice.materials.reduce((sum, mat) => sum + (mat.quantity * mat.unitCost), 0);
  const subtotal = servicesTotal;
  const tax = subtotal * 0.06;
  const total = subtotal + tax;

  // George's Music upcharge
  const georgesSubtotal = invoice.isGeorgesMusic ? subtotal * 1.54 : subtotal;
  const georgesTax = georgesSubtotal * 0.06;
  const georgesTotal = georgesSubtotal + georgesTax;

  const instrumentsList = invoice.instruments.map(i => `${i.type}${i.description ? ' (Instrument Model: ' + i.description + ')' : ''}`).join('; ');

  const fields = [
    invoice.invoiceNumber,
    invoice.dateReceived,
    invoice.date,
    invoice.customerName,
    invoice.customerPhone,
    invoice.customerEmail,
    invoice.customerAddress || '',
    instrumentsList,
    invoice.repairDescription.replace(/"/g, '""').replace(/\n/g, ' '),
    invoice.materials.map(m => `${m.description} ($${m.unitCost})`).join('; '),
    servicesTotal.toFixed(2),
    subtotal.toFixed(2),
    // include delivery if present
    (invoice.deliveryFee || 0).toFixed(2),
    tax.toFixed(2),
    total.toFixed(2),
    invoice.isGeorgesMusic ? 'Yes' : 'No',
    georgesSubtotal.toFixed(2),
    georgesTax.toFixed(2),
    georgesTotal.toFixed(2),
    invoice.notes.replace(/"/g, '""').replace(/\n/g, ' '),
  ];

  return fields.map(field => `"${field}"`).join(',');
};

export const getCSVHeaders = (): string => {
  const headers = [
    'Invoice Number',
    'Date Received',
    'Invoice Date',
    'Customer Name',
    'Customer Phone',
    'Customer Email',
    'Instruments',
    'Repair Description',
    'Service or Material',
    'Services Total',
    'Subtotal',
    'Tax',
    'Total (Your Charge)',
    'Georges Music Repair',
    'Georges Subtotal (1.54x)',
    'Georges Tax',
    'Georges Total',
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
  const invoices = JSON.parse(localStorage.getItem('delco-invoices') || '[]');

  // Migration: ensure all invoices have required fields
  return invoices.map((invoice: any) => ({
    ...invoice,
    dateReceived: invoice.dateReceived || invoice.date || new Date().toISOString().split('T')[0],
    customerAddress: invoice.customerAddress || invoice.address || '',
    deliveryMiles: typeof invoice.deliveryMiles === 'number' ? invoice.deliveryMiles : (invoice.delivery_miles || null),
    deliveryFee: typeof invoice.deliveryFee === 'number' ? invoice.deliveryFee : (invoice.delivery_fee || 0),
    instruments: invoice.instruments || [{ type: invoice.instrumentType || 'Other', description: invoice.instrumentDescription || '' }],
    invoiceHtml: invoice.invoiceHtml || '',
  }));
};

export const exportAllInvoicesToCSV = () => {
  const invoices = getAllInvoicesFromLocalStorage();
  if (invoices.length === 0) {
    alert('No invoices to export. Create some invoices first!');
    return;
  }
  downloadCSV(invoices);
};
