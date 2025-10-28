import { useState } from 'react';
import { RepairInvoice, RepairMaterial } from '@/lib/invoice-types';
import { downloadInvoicePDF } from '@/lib/pdf-generator';
import { addInvoiceToLocalStorage, exportAllInvoicesToCSV, getAllInvoicesFromLocalStorage } from '@/lib/csv-exporter';
import { extractInvoiceData } from '@/lib/ocr-utils';
import { Download, Plus, Trash2, FileText, Upload, Loader, Search } from 'lucide-react';
import { AlertDialog, useAlert } from '@/components/AlertDialog';

const BILL_PHONE_NUMBERS = ['610-505-6096', '6105056096', '(610) 505-6096'];
const BILL_EMAILS = ['bill@delcomusicco.com', 'billbaraldi@gmail.com'];

export default function Index() {
  const [showForm, setShowForm] = useState(true);
  const [showInvoices, setShowInvoices] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState(() => {
    const stored = localStorage.getItem('nextInvoiceNumber');
    return stored ? parseInt(stored) : 1001;
  });

  const [formData, setFormData] = useState({
    invoiceNumber: '' as string,
    dateReceived: new Date().toISOString().split('T')[0] as string,
    date: new Date().toISOString().split('T')[0] as string,
    customerName: '' as string,
    customerPhone: '' as string,
    customerEmail: '' as string,
    repairDescription: '' as string,
    laborHours: 0 as number,
    hourlyRate: 0 as number,
    notes: '' as string,
    isGeorgesMusic: false as boolean,
  });

  const [instruments, setInstruments] = useState([{ type: '', description: '' }]);

  const [materials, setMaterials] = useState<RepairMaterial[]>([
    { description: '', quantity: 1, unitCost: 0 },
  ]);

  const [savedInvoices, setSavedInvoices] = useState<RepairInvoice[]>(getAllInvoicesFromLocalStorage());
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const alert = useAlert();

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleOCRUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingOCR(true);
    setOcrProgress(30);

    try {
      const extracted = await extractInvoiceData(file);
      setOcrProgress(80);

      let phone = extracted.customerPhone || '';
      let email = extracted.customerEmail || '';

      if (BILL_PHONE_NUMBERS.some(p => phone.includes(p.replace(/\D/g, '')))) {
        phone = '';
      }

      if (BILL_EMAILS.includes(email.toLowerCase())) {
        email = '';
      }

      setFormData(prev => ({
        ...prev,
        customerName: extracted.customerName || prev.customerName,
        customerPhone: phone || prev.customerPhone,
        customerEmail: email || prev.customerEmail,
        repairDescription: extracted.repairDescription || prev.repairDescription,
      }));

      if (extracted.instruments && extracted.instruments.length > 0) {
        setInstruments(extracted.instruments);
      }

      if (extracted.materials && extracted.materials.length > 0) {
        setMaterials(extracted.materials);
      }

      setOcrProgress(100);
      setTimeout(() => {
        alert.show('Invoice data extracted successfully! Please review and adjust as needed.', 'success');
        setOcrProgress(0);
      }, 500);
    } catch (error) {
      console.error('OCR Error:', error);
      alert('❌ Failed to extract invoice data. Please check the image quality and try again.');
      setOcrProgress(0);
    } finally {
      setIsProcessingOCR(false);
      e.target.value = '';
    }
  };

  const handleInstrumentChange = (index: number, field: 'type' | 'description', value: string) => {
    const newInstruments = [...instruments];
    newInstruments[index][field] = value;
    setInstruments(newInstruments);
  };

  const addInstrument = () => {
    setInstruments([...instruments, { type: '', description: '' }]);
  };

  const removeInstrument = (index: number) => {
    setInstruments(instruments.filter((_, i) => i !== index));
  };

  const handleMaterialChange = (index: number, field: keyof RepairMaterial, value: string | number) => {
    const newMaterials = [...materials];
    if (field === 'quantity' || field === 'unitCost') {
      newMaterials[index][field] = parseFloat(value as string) || 0;
    } else {
      newMaterials[index][field] = value as string;
    }
    setMaterials(newMaterials);
  };

  const addMaterial = () => {
    setMaterials([...materials, { description: '', quantity: 1, unitCost: 0 }]);
  };

  const removeMaterial = (index: number) => {
    setMaterials(materials.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.invoiceNumber) {
      alert('Please enter an Invoice Number');
      return;
    }

    if (!formData.customerName || instruments.some(i => !i.type) || !formData.repairDescription) {
      alert('Please fill in: Invoice #, Customer Name, Instrument Type(s), and Repair Description');
      return;
    }

    const invoice: RepairInvoice = {
      ...formData,
      instruments: instruments.filter(i => i.type.trim()),
      materials: materials.filter(m => m.description.trim()),
      invoiceHtml: '', // Will be populated after PDF generation
    };

    const invoiceHtml = generateInvoicePDF(invoice);
    invoice.invoiceHtml = invoiceHtml;

    addInvoiceToLocalStorage(invoice);
    setSavedInvoices([...savedInvoices, invoice]);

    downloadInvoicePDF(invoice);

    setFormData({
      invoiceNumber: '',
      dateReceived: new Date().toISOString().split('T')[0],
      date: new Date().toISOString().split('T')[0],
      customerName: '',
      customerPhone: '',
      customerEmail: '',
      repairDescription: '',
      laborHours: 0,
      hourlyRate: 0,
      notes: '',
      isGeorgesMusic: false,
    });

    setInstruments([{ type: '', description: '' }]);
    setMaterials([{ description: '', quantity: 1, unitCost: 0 }]);
    alert('Invoice created and saved! PDF ready to print.');
  };

  const calculateTotals = () => {
    const servicesTotal = materials.reduce((sum, mat) => sum + (mat.quantity * mat.unitCost), 0);
    const subtotal = servicesTotal;
    const tax = subtotal * 0.06;
    const total = subtotal + tax;

    // George's Music upcharge (1.54x)
    const georgesUpcharge = formData.isGeorgesMusic ? 1.54 : 1;
    const georgesSubtotal = subtotal * georgesUpcharge;
    const georgesTax = georgesSubtotal * 0.06;
    const georgesTotal = georgesSubtotal + georgesTax;

    return {
      servicesTotal,
      subtotal,
      tax,
      total,
      georgesSubtotal,
      georgesTax,
      georgesTotal,
    };
  };

  const getFilteredInvoices = () => {
    if (!searchQuery.trim()) return savedInvoices;
    
    const query = searchQuery.toLowerCase();
    return savedInvoices.filter(invoice => 
      invoice.invoiceNumber.toLowerCase().includes(query) ||
      invoice.customerName.toLowerCase().includes(query) ||
      invoice.customerPhone.toLowerCase().includes(query) ||
      invoice.customerEmail.toLowerCase().includes(query) ||
      invoice.instrumentType.toLowerCase().includes(query) ||
      invoice.instrumentDescription.toLowerCase().includes(query) ||
      invoice.repairDescription.toLowerCase().includes(query) ||
      invoice.date.includes(query)
    );
  };

  const totals = calculateTotals();
  const filteredInvoices = getFilteredInvoices();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with Blue Bar */}
      <div className="bg-white border-b border-gray-200">
        <div className="h-1 bg-primary"></div>
        <header className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-primary">Delco Music Co</h1>
              <p className="text-sm text-muted-foreground mt-1">Repair Invoice Manager</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowForm(!showForm)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-foreground font-semibold rounded-sm transition-colors text-sm"
              >
                {showForm ? 'Hide Form' : 'Show Form'}
              </button>
              <button
                onClick={() => setShowInvoices(!showInvoices)}
                className="btn-primary flex items-center gap-2"
              >
                <FileText size={16} />
                Records ({savedInvoices.length})
              </button>
            </div>
          </div>
        </header>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Form Section */}
          {showForm && (
            <div className="lg:col-span-2">
              <div className="card-modern p-8">
                <h2 className="text-2xl font-bold text-foreground mb-6">New Invoice</h2>

                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Image Upload for OCR */}
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">📸 Auto-Fill from Image</label>
                    <div className="relative border-2 border-dashed border-primary/30 rounded-sm p-6 bg-blue-50 hover:border-primary/50 transition-colors cursor-pointer group">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleOCRUpload}
                        disabled={isProcessingOCR}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div className="text-center">
                        {isProcessingOCR ? (
                          <>
                            <Loader className="mx-auto mb-1 animate-spin text-primary" size={18} />
                            <p className="text-xs font-semibold text-foreground">Processing... {ocrProgress}%</p>
                          </>
                        ) : (
                          <>
                            <Upload className="mx-auto mb-1 text-primary group-hover:scale-110 transition-transform" size={18} />
                            <p className="text-xs font-semibold text-foreground">Upload invoice screenshot</p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Invoice # & Dates Row */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-foreground mb-1">Invoice # *</label>
                      <input type="text" name="invoiceNumber" value={formData.invoiceNumber} onChange={handleFormChange} placeholder="e.g., 337-001" className="input-modern text-sm" required />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-foreground mb-1">Date Received</label>
                      <input type="date" name="dateReceived" value={formData.dateReceived} onChange={handleFormChange} className="input-modern text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-foreground mb-1">Invoice Date</label>
                      <input type="date" name="date" value={formData.date} onChange={handleFormChange} className="input-modern text-sm" required />
                    </div>
                  </div>

                  {/* Instruments */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold text-foreground">Instruments *</label>
                      <button type="button" onClick={addInstrument} className="text-xs text-primary hover:text-primary/80 font-semibold flex items-center gap-1">
                        <Plus size={14} /> Add Instrument
                      </button>
                    </div>
                    <div className="space-y-2 bg-gray-50 p-4 rounded-sm border border-gray-200">
                      {instruments.map((instrument, index) => (
                        <div key={index} className="grid grid-cols-2 gap-2 items-end">
                          <select
                            value={instrument.type}
                            onChange={(e) => handleInstrumentChange(index, 'type', e.target.value)}
                            className="input-modern text-sm"
                          >
                            <option value="">Select instrument</option>
                            <option value="Guitar">Guitar</option>
                            <option value="Bass">Bass</option>
                            <option value="Violin">Violin</option>
                            <option value="Cello">Cello</option>
                            <option value="Keyboard">Keyboard</option>
                            <option value="Drums">Drums</option>
                            <option value="Wind">Wind</option>
                            <option value="Other">Other</option>
                          </select>
                          <div className="flex gap-2 items-end">
                            <input
                              type="text"
                              value={instrument.description}
                              onChange={(e) => handleInstrumentChange(index, 'description', e.target.value)}
                              placeholder="Description (optional)"
                              className="input-modern text-sm flex-1"
                            />
                            {instruments.length > 1 && (
                              <button type="button" onClick={() => removeInstrument(index)} className="p-2 text-destructive hover:bg-destructive/10 rounded transition-colors">
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Customer Info Row */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-foreground mb-1">Customer Name *</label>
                      <input type="text" name="customerName" value={formData.customerName} onChange={handleFormChange} placeholder="Name" className="input-modern text-sm" required />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-foreground mb-1">Phone</label>
                      <input type="tel" name="customerPhone" value={formData.customerPhone} onChange={handleFormChange} placeholder="Phone" className="input-modern text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-foreground mb-1">Email</label>
                      <input type="email" name="customerEmail" value={formData.customerEmail} onChange={handleFormChange} placeholder="Email" className="input-modern text-sm" />
                    </div>
                  </div>

                  {/* Repair Work */}
                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1">Repair Work *</label>
                    <input type="text" name="repairDescription" value={formData.repairDescription} onChange={handleFormChange} placeholder="What work was done" className="input-modern text-sm" required />
                  </div>

                  {/* George's Music Toggle */}
                  <div className="flex items-center gap-3 bg-blue-50 p-4 rounded-sm border border-blue-200">
                    <label className="flex items-center gap-2 cursor-pointer flex-1">
                      <input
                        type="checkbox"
                        name="isGeorgesMusic"
                        checked={formData.isGeorgesMusic}
                        onChange={handleFormChange}
                        className="w-4 h-4 cursor-pointer"
                      />
                      <span className="text-sm font-semibold text-foreground">George's Price</span>
                    </label>
                  </div>

                  {/* Services/Materials */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold text-foreground">Services</label>
                      <button type="button" onClick={addMaterial} className="text-xs text-primary hover:text-primary/80 font-semibold flex items-center gap-1">
                        <Plus size={14} /> Add Service
                      </button>
                    </div>
                    <div className="space-y-2 bg-gray-50 p-4 rounded-sm border border-gray-200">
                      {materials.map((material, index) => (
                        <div key={index} className="flex gap-2 items-end">
                          <input
                            type="text"
                            value={material.description}
                            onChange={(e) => handleMaterialChange(index, 'description', e.target.value)}
                            placeholder="Service description"
                            className="input-modern text-sm flex-1"
                          />
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={material.unitCost}
                            onChange={(e) => handleMaterialChange(index, 'unitCost', e.target.value)}
                            placeholder="Price"
                            className="input-modern text-sm w-24"
                          />
                          {materials.length > 1 && (
                            <button type="button" onClick={() => removeMaterial(index)} className="p-2 text-destructive hover:bg-destructive/10 rounded transition-colors">
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1">Notes</label>
                    <textarea name="notes" value={formData.notes} onChange={handleFormChange} placeholder="Any additional notes..." className="input-modern text-sm min-h-16" />
                  </div>

                  {/* Submit Button */}
                  <button type="submit" className="w-full bg-primary text-primary-foreground font-bold py-3 rounded-sm hover:bg-primary/90 transition-all duration-300 flex items-center justify-center gap-2">
                    <Download size={18} />
                    Create Invoice & Download PDF
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Summary Panel */}
          <div className="lg:col-span-1">
            <div className="card-modern p-6 sticky top-6">
              <h3 className="text-lg font-bold text-foreground mb-4">Totals</h3>

              <div className="space-y-3 mb-6 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Services:</span>
                  <span className="font-semibold text-foreground">${totals.servicesTotal.toFixed(2)}</span>
                </div>
                <div className="border-t border-border pt-3 flex justify-between items-center">
                  <span className="text-muted-foreground">Subtotal:</span>
                  <span className="font-semibold text-foreground">${totals.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Tax (6%):</span>
                  <span className="font-semibold text-foreground">${totals.tax.toFixed(2)}</span>
                </div>
                <div className="border-t-2 border-primary pt-3 flex justify-between items-center font-bold">
                  <span className="text-foreground">Your Total:</span>
                  <span className="text-xl text-primary">${totals.total.toFixed(2)}</span>
                </div>

                {/* George's Music Upcharge */}
                {formData.isGeorgesMusic && (
                  <div className="mt-4 pt-4 border-t-2 border-blue-300 space-y-2">
                    <p className="text-xs font-semibold text-blue-900 bg-blue-50 p-2 rounded">George's Music Invoice (1.54x)</p>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground">Subtotal (1.54x):</span>
                      <span className="font-semibold text-foreground">${totals.georgesSubtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground">Tax (6%):</span>
                      <span className="font-semibold text-foreground">${totals.georgesTax.toFixed(2)}</span>
                    </div>
                    <div className="border-t border-blue-300 pt-2 flex justify-between items-center font-bold">
                      <span className="text-blue-900">George's Total:</span>
                      <span className="text-lg text-blue-600">${totals.georgesTotal.toFixed(2)}</span>
                    </div>
                  </div>
                )}
              </div>

              {showForm && (
                <>
                  <button onClick={() => exportAllInvoicesToCSV()} className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2 rounded-sm transition-colors mb-3 flex items-center justify-center gap-2 text-sm">
                    <Download size={16} />
                    Export All to CSV
                  </button>
                  <div className="bg-blue-50 border border-blue-200 rounded-sm p-3 text-xs">
                    <p className="font-semibold text-blue-900 mb-1">💾 Saved</p>
                    <p className="text-blue-800">{savedInvoices.length} invoice(s)</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Saved Invoices Section */}
        {showInvoices && savedInvoices.length > 0 && (
          <div className="mt-12">
            <div className="card-modern p-6">
              <h2 className="text-2xl font-bold text-foreground mb-4">📋 All Repairs</h2>
              
              {/* Search Box */}
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                  <input
                    type="text"
                    placeholder="Search by customer, invoice #, phone, instrument..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="input-modern w-full text-sm pl-9"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Found {filteredInvoices.length} of {savedInvoices.length} repairs
                </p>
              </div>

              {filteredInvoices.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No repairs found matching your search.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-primary bg-gray-50">
                        <th className="text-left py-3 px-3 font-semibold text-foreground">Invoice</th>
                        <th className="text-left py-3 px-3 font-semibold text-foreground">Date</th>
                        <th className="text-left py-3 px-3 font-semibold text-foreground">Customer</th>
                        <th className="text-left py-3 px-3 font-semibold text-foreground">Phone</th>
                        <th className="text-left py-3 px-3 font-semibold text-foreground">Instrument</th>
                        <th className="text-left py-3 px-3 font-semibold text-foreground">Repair Work</th>
                        <th className="text-center py-3 px-3 font-semibold text-foreground">George's</th>
                        <th className="text-right py-3 px-3 font-semibold text-foreground">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInvoices.map((invoice, idx) => {
                        const servicesTotal = invoice.materials.reduce((sum, mat) => sum + (mat.quantity * mat.unitCost), 0);
                        const yourTotal = (servicesTotal) * 1.06;
                        const georgesTotal = (servicesTotal * 1.54) * 1.06;
                        const displayTotal = invoice.isGeorgesMusic ? georgesTotal : yourTotal;

                        return (
                          <tr key={idx} className={`border-b border-border hover:bg-gray-50 transition-colors ${invoice.isGeorgesMusic ? 'bg-blue-50' : ''}`}>
                            <td className="py-3 px-3 font-semibold text-primary">{invoice.invoiceNumber}</td>
                            <td className="py-3 px-3 text-muted-foreground">{new Date(invoice.date).toLocaleDateString()}</td>
                            <td className="py-3 px-3 text-foreground">{invoice.customerName}</td>
                            <td className="py-3 px-3 text-foreground text-xs">{invoice.customerPhone || '—'}</td>
                            <td className="py-3 px-3 text-foreground">{invoice.instrumentType}</td>
                            <td className="py-3 px-3 text-foreground text-xs">{invoice.repairDescription.substring(0, 40)}{invoice.repairDescription.length > 40 ? '...' : ''}</td>
                            <td className="py-3 px-3 text-center text-xs font-semibold">
                              {invoice.isGeorgesMusic ? <span className="bg-blue-200 text-blue-900 px-2 py-1 rounded">Yes</span> : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="py-3 px-3 text-right font-bold text-primary">${displayTotal.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
