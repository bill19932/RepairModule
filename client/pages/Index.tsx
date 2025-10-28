import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { RepairInvoice, RepairMaterial } from '@/lib/invoice-types';
import { generateInvoicePDF, downloadInvoicePDF } from '@/lib/pdf-generator';
import { addInvoiceToLocalStorage, exportAllInvoicesToCSV, getAllInvoicesFromLocalStorage } from '@/lib/csv-exporter';
import { extractInvoiceData } from '@/lib/ocr-utils';
import { geocodeAddress, haversineMiles } from '@/lib/geocode';
import { Download, Plus, Trash2, FileText, Upload, Loader, Search } from 'lucide-react';
import { AlertDialog, useAlert } from '@/components/AlertDialog';

const BILL_PHONE_NUMBERS = ['610-505-6096', '6105056096', '(610) 505-6096', '610.505.6096'];
const BILL_EMAILS = ['bill@delcomusicco.com', 'billbaraldi@gmail.com'];

export default function Index() {
  const [showForm, setShowForm] = useState(true);
  const navigate = useNavigate();
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
    customerAddress: '' as string,
    repairDescription: '' as string,
    laborHours: 0 as number,
    hourlyRate: 0 as number,
    // notes removed per request
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
  const [deliveryMiles, setDeliveryMiles] = useState<number | null>(null);
  const [deliveryFee, setDeliveryFee] = useState<number>(0);
  const alert = useAlert();

  // Keep saved invoices in sync when returning to this page and across tabs
  useEffect(() => {
    const refresh = () => setSavedInvoices(getAllInvoicesFromLocalStorage());
    refresh();
    window.addEventListener('focus', refresh);
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'delco-invoices') refresh();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const calculateDeliveryFee = async (address: string) => {
    if (!address || !address.trim() || formData.isGeorgesMusic) {
      setDeliveryMiles(null);
      setDeliveryFee(0);
      return;
    }

    try {
      // Clean up address: remove Unit/Apt/Suite numbers for geocoding
      let cleanAddr = address.trim();
      cleanAddr = cleanAddr.replace(/\b(?:Unit|Apt|Apt\.|Apartment|Suite|Ste|Ste\.)\s*[0-9A-Za-z-]+/gi, '').trim();

      const fullAddr = cleanAddr.includes(',') ? cleanAddr : `${cleanAddr}, PA`;
      const customerCoords = await geocodeAddress(fullAddr);

      if (!customerCoords) {
        setDeliveryMiles(null);
        setDeliveryFee(0);
        return;
      }

      const baseCoords = await geocodeAddress('150 E Wynnewood Rd, Wynnewood, PA');
      if (!baseCoords) {
        setDeliveryMiles(null);
        setDeliveryFee(0);
        return;
      }

      const miles = haversineMiles(baseCoords.lat, baseCoords.lon, customerCoords.lat, customerCoords.lon);
      const roundedMiles = Math.round(miles);
      const fee = roundedMiles * 2 * 0.85;
      const finalFee = parseFloat(fee.toFixed(2));

      setDeliveryMiles(roundedMiles);
      setDeliveryFee(finalFee);

    } catch (err) {
      setDeliveryMiles(null);
      setDeliveryFee(0);
    }
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

      // Filter out Bill's phone number (compare without formatting)
      const phoneDigitsOnly = phone.replace(/\D/g, '');
      if (BILL_PHONE_NUMBERS.some(p => p.replace(/\D/g, '') === phoneDigitsOnly)) {
        phone = '';
      }

      if (BILL_EMAILS.includes(email.toLowerCase())) {
        email = '';
      }

      setFormData(prev => ({
        ...prev,
        invoiceNumber: extracted.invoiceNumber || prev.invoiceNumber,
        customerName: extracted.customerName || prev.customerName,
        customerPhone: phone || prev.customerPhone,
        customerEmail: email || prev.customerEmail,
        customerAddress: extracted.customerAddress || prev.customerAddress,
        repairDescription: extracted.repairDescription || prev.repairDescription,
      }));

      if (extracted.instruments && extracted.instruments.length > 0) {
        setInstruments(extracted.instruments);
      }

      // Set extracted materials
      if (extracted.materials && extracted.materials.length > 0) {
        setMaterials(extracted.materials);
      }

      // Calculate delivery fee if address was extracted
      if (extracted.customerAddress) {
        await calculateDeliveryFee(extracted.customerAddress);
      }

      setOcrProgress(100);
      setTimeout(() => {
        alert.show('Invoice data extracted successfully! Please review and adjust as needed.', 'success');
        setOcrProgress(0);
      }, 500);
    } catch (error) {
      console.error('OCR Error:', error);
      alert.show('Failed to extract invoice data. Please check the image quality and try again.', 'error');
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
      alert.show('Please enter an Invoice Number', 'warning');
      return;
    }

    if (!formData.customerName || instruments.some(i => !i.type) || !formData.repairDescription) {
      alert.show('Please fill in: Invoice #, Customer Name, Instrument Type(s), and Repair Description', 'warning');
      return;
    }

    const invoice: RepairInvoice = {
      ...formData,
      instruments: instruments.filter(i => i.type.trim()),
      materials: materials.filter(m => m.description.trim()),
      deliveryMiles: deliveryMiles ?? 0,
      deliveryFee: formData.isGeorgesMusic ? 0 : (deliveryFee || 0),
      invoiceHtml: '', // Will be populated after PDF generation
    };

    let invoiceHtml = '';
    try {
      if (typeof generateInvoicePDF === 'function') {
        invoiceHtml = generateInvoicePDF(invoice);
        invoice.invoiceHtml = invoiceHtml;
      } else {
        invoice.invoiceHtml = '';
      }
    } catch (err) {
      console.error('PDF generation error:', err);
      invoice.invoiceHtml = '';
    }

    addInvoiceToLocalStorage(invoice);
    setSavedInvoices(prev => [...prev, invoice]);

    try {
      downloadInvoicePDF(invoice);
    } catch (err) {
      console.error('Download/print error:', err);
    }

    setFormData({
      invoiceNumber: '',
      dateReceived: new Date().toISOString().split('T')[0],
      date: new Date().toISOString().split('T')[0],
      customerName: '',
      customerPhone: '',
      customerEmail: '',
      customerAddress: '',
      repairDescription: '',
      laborHours: 0,
      hourlyRate: 0,
      isGeorgesMusic: false,
    });

    setInstruments([{ type: '', description: '' }]);
    setMaterials([{ description: '', quantity: 1, unitCost: 0 }]);
    setDeliveryMiles(null);
    setDeliveryFee(0);
    alert.show('Invoice created and saved! PDF ready to print.', 'success');
  };

  const handleDeleteInvoice = (invoiceNumber: string) => {
    const updatedInvoices = savedInvoices.filter(inv => inv.invoiceNumber !== invoiceNumber);
    setSavedInvoices(updatedInvoices);
    localStorage.setItem('delco-invoices', JSON.stringify(updatedInvoices));
    alert.show('Repair deleted successfully.', 'success');
  };

  const calculateTotals = () => {
    const servicesTotal = materials.reduce((sum, mat) => sum + (mat.quantity * mat.unitCost), 0);
    const subtotal = servicesTotal;

    // Add delivery fee (separate from materials)
    const deliveryAmount = formData.isGeorgesMusic ? 0 : (deliveryFee || 0);
    const subtotalWithDelivery = subtotal + deliveryAmount;
    const tax = subtotalWithDelivery * 0.06;
    const total = subtotalWithDelivery + tax;

    // George's Music upcharge (1.54x) - applies to services only, not delivery
    const georgesUpcharge = formData.isGeorgesMusic ? 1.54 : 1;
    const georgesSubtotal = subtotal * georgesUpcharge;
    const georgesTax = georgesSubtotal * 0.06;
    const georgesTotal = georgesSubtotal + georgesTax;

    return {
      servicesTotal,
      subtotal,
      delivery: deliveryAmount,
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
            <div className="flex items-center gap-3">
              <img src="https://cdn.builder.io/api/v1/image/assets%2F99d159038b9d45ab8f72730367c1abf4%2F9753a3ec93ee4d5dba7a86a75c0f457f?format=webp&width=800" alt="Delco Music Co" className="h-10 object-contain" />
              <div>
                <div className="text-xl font-bold text-primary">Delco Music Co</div>
                <p className="text-sm text-muted-foreground mt-1">Repair Invoice Manager</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowForm(!showForm)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-foreground font-semibold rounded-sm transition-colors text-sm"
              >
                {showForm ? 'Hide Form' : 'Show Form'}
              </button>
              <button
                onClick={() => navigate('/records')}
                className="btn-primary flex items-center gap-2"
              >
                <FileText size={16} />
                Records
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

                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-foreground mb-1">Address</label>
                      <input type="text" name="customerAddress" value={formData.customerAddress} onChange={(e) => {
                        handleFormChange(e);
                        const addr = e.target.value;
                        console.log('[ADDRESS-INPUT] Address entered:', addr);
                        if (addr.trim()) {
                          calculateDeliveryFee(addr.trim());
                        }
                      }} placeholder="Client address" className="input-modern text-sm" />
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
                            <option value="">Select Instrument</option>
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
                              placeholder="Instrument Model"
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

                  {/* Repair Work */}
                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1">Repair Work *</label>
                    <input type="text" name="repairDescription" value={formData.repairDescription} onChange={handleFormChange} placeholder="What work was done" className="input-modern text-sm" required />
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
                            placeholder="Service or Material"
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
                      {!formData.isGeorgesMusic && deliveryMiles !== null && (
                        <div className="flex gap-2 items-end bg-blue-50 p-2 rounded border border-blue-200">
                          <input
                            type="text"
                            disabled
                            value={`Delivery Fee (${deliveryMiles} miles × 2 trips)`}
                            className="input-modern text-sm flex-1 bg-blue-100 text-gray-700 cursor-not-allowed"
                          />
                          <input
                            type="text"
                            disabled
                            value={`$${deliveryFee.toFixed(2)}`}
                            className="input-modern text-sm w-24 bg-blue-100 text-gray-700 cursor-not-allowed font-semibold text-right"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Submit Button */}
                  <div className="flex justify-center items-center gap-6">
                    <label className="flex items-center gap-2 cursor-pointer whitespace-nowrap">
                      <input
                        type="checkbox"
                        name="isGeorgesMusic"
                        checked={formData.isGeorgesMusic}
                        onChange={handleFormChange}
                        className="w-4 h-4 cursor-pointer"
                      />
                      <span className="text-xs font-semibold text-foreground">George's Price</span>
                    </label>
                    <button type="submit" className="bg-primary text-primary-foreground font-bold py-2 px-6 rounded-sm hover:bg-primary/90 transition-all duration-300 flex items-center justify-center gap-2 text-sm">
                      <Download size={16} />
                      Print
                    </button>
                  </div>
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
                {!formData.isGeorgesMusic && deliveryMiles !== null && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">Delivery Fee ({deliveryMiles} mi):</span>
                    <span className="font-semibold text-foreground">${totals.delivery.toFixed(2)}</span>
                  </div>
                )}
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

            </div>
          </div>
        </div>

        {/* Saved Invoices Section */}
              </main>

      <AlertDialog
        title=""
        message={alert.message}
        isOpen={alert.isOpen}
        onClose={alert.close}
        type={alert.type}
      />
    </div>
  );
}
