import { useState } from 'react';
import { RepairInvoice, RepairMaterial } from '@/lib/invoice-types';
import { downloadInvoicePDF } from '@/lib/pdf-generator';
import { addInvoiceToLocalStorage, exportAllInvoicesToCSV, getAllInvoicesFromLocalStorage } from '@/lib/csv-exporter';
import { Download, Plus, Trash2, Eye, EyeOff, FileText } from 'lucide-react';

export default function Index() {
  const [showForm, setShowForm] = useState(true);
  const [showInvoices, setShowInvoices] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState(() => {
    const stored = localStorage.getItem('nextInvoiceNumber');
    return stored ? parseInt(stored) : 1001;
  });

  const [formData, setFormData] = useState({
    invoiceNumber: `INV-${invoiceNumber}`,
    date: new Date().toISOString().split('T')[0],
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    instrumentType: '',
    instrumentDescription: '',
    repairDescription: '',
    laborHours: 1,
    hourlyRate: 75,
    notes: '',
  });

  const [materials, setMaterials] = useState<RepairMaterial[]>([
    { description: '', quantity: 1, unitCost: 0 },
  ]);

  const [savedInvoices, setSavedInvoices] = useState<RepairInvoice[]>(getAllInvoicesFromLocalStorage());

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'laborHours' || name === 'hourlyRate' ? parseFloat(value) : value,
    }));
  };

  const handleMaterialChange = (index: number, field: keyof RepairMaterial, value: string | number) => {
    const newMaterials = [...materials];
    if (field === 'quantity' || field === 'unitCost') {
      newMaterials[index][field] = parseFloat(value as string);
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

    if (!formData.customerName || !formData.instrumentType || !formData.repairDescription) {
      alert('Please fill in all required fields (Customer Name, Instrument Type, and Repair Description)');
      return;
    }

    const invoice: RepairInvoice = {
      ...formData,
      materials: materials.filter(m => m.description.trim()),
    };

    addInvoiceToLocalStorage(invoice);
    setSavedInvoices([...savedInvoices, invoice]);

    const nextNumber = invoiceNumber + 1;
    setInvoiceNumber(nextNumber);
    localStorage.setItem('nextInvoiceNumber', nextNumber.toString());

    downloadInvoicePDF(invoice);

    setFormData({
      invoiceNumber: `INV-${nextNumber}`,
      date: new Date().toISOString().split('T')[0],
      customerName: '',
      customerPhone: '',
      customerEmail: '',
      instrumentType: '',
      instrumentDescription: '',
      repairDescription: '',
      laborHours: 1,
      hourlyRate: 75,
      notes: '',
    });

    setMaterials([{ description: '', quantity: 1, unitCost: 0 }]);

    alert('Invoice created and saved! PDF ready to print.');
  };

  const calculateTotals = () => {
    const materialsTotal = materials.reduce((sum, mat) => sum + (mat.quantity * mat.unitCost), 0);
    const laborTotal = formData.laborHours * formData.hourlyRate;
    const subtotal = materialsTotal + laborTotal;
    const tax = subtotal * 0.08;
    const total = subtotal + tax;
    return { materialsTotal, laborTotal, subtotal, tax, total };
  };

  const totals = calculateTotals();

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-amber-100/50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/70 rounded-lg flex items-center justify-center">
                <span className="text-xl text-white font-bold">🎸</span>
              </div>
              <div>
                <h1 className="text-2xl font-display font-bold text-primary">Delco Music Co</h1>
                <p className="text-xs text-muted-foreground">Repair Invoice Manager</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowForm(!showForm)}
                className="btn-primary flex items-center gap-2"
              >
                {showForm ? <EyeOff size={18} /> : <Eye size={18} />}
                {showForm ? 'Hide Form' : 'Show Form'}
              </button>
              <button
                onClick={() => setShowInvoices(!showInvoices)}
                className="btn-secondary flex items-center gap-2"
              >
                <FileText size={18} />
                Records ({savedInvoices.length})
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Form Section */}
          {showForm && (
            <div className="lg:col-span-2">
              <div className="card-modern p-8">
                <h2 className="text-3xl font-display font-bold text-foreground mb-8">New Repair Invoice</h2>

                <form onSubmit={handleSubmit} className="space-y-8">
                  {/* Invoice & Date */}
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-foreground mb-2">Invoice Number</label>
                      <input
                        type="text"
                        value={formData.invoiceNumber}
                        readOnly
                        className="input-modern bg-muted/50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-foreground mb-2">Date</label>
                      <input
                        type="date"
                        name="date"
                        value={formData.date}
                        onChange={handleFormChange}
                        className="input-modern"
                        required
                      />
                    </div>
                  </div>

                  {/* Customer Information */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-primary flex items-center gap-2">
                      👤 Customer Information
                    </h3>
                    <div className="space-y-4 bg-primary/5 p-6 rounded-lg border border-primary/10">
                      <div>
                        <label className="block text-sm font-semibold text-foreground mb-2">
                          Customer Name <span className="text-destructive">*</span>
                        </label>
                        <input
                          type="text"
                          name="customerName"
                          value={formData.customerName}
                          onChange={handleFormChange}
                          placeholder="John Doe"
                          className="input-modern"
                          required
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-foreground mb-2">Phone</label>
                          <input
                            type="tel"
                            name="customerPhone"
                            value={formData.customerPhone}
                            onChange={handleFormChange}
                            placeholder="(555) 123-4567"
                            className="input-modern"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-foreground mb-2">Email</label>
                          <input
                            type="email"
                            name="customerEmail"
                            value={formData.customerEmail}
                            onChange={handleFormChange}
                            placeholder="john@example.com"
                            className="input-modern"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Instrument Information */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-accent flex items-center gap-2">
                      🎵 Instrument Information
                    </h3>
                    <div className="space-y-4 bg-accent/10 p-6 rounded-lg border border-accent/20">
                      <div>
                        <label className="block text-sm font-semibold text-foreground mb-2">
                          Instrument Type <span className="text-destructive">*</span>
                        </label>
                        <select
                          name="instrumentType"
                          value={formData.instrumentType}
                          onChange={handleFormChange}
                          className="input-modern"
                          required
                        >
                          <option value="">Select instrument type</option>
                          <option value="Guitar">Guitar (Acoustic/Electric)</option>
                          <option value="Bass">Bass Guitar</option>
                          <option value="Violin">Violin</option>
                          <option value="Cello">Cello</option>
                          <option value="Keyboard">Keyboard/Piano</option>
                          <option value="Drums">Drums</option>
                          <option value="Wind">Wind Instrument</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-foreground mb-2">Instrument Description</label>
                        <input
                          type="text"
                          name="instrumentDescription"
                          value={formData.instrumentDescription}
                          onChange={handleFormChange}
                          placeholder="e.g., Fender Stratocaster, 2010, Sunburst"
                          className="input-modern"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Repair Description */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-green-600 flex items-center gap-2">
                      🔧 Repair Work
                    </h3>
                    <div className="bg-green-50 p-6 rounded-lg border border-green-200">
                      <label className="block text-sm font-semibold text-foreground mb-2">
                        Repair Description <span className="text-destructive">*</span>
                      </label>
                      <textarea
                        name="repairDescription"
                        value={formData.repairDescription}
                        onChange={handleFormChange}
                        placeholder="Describe the repair work performed..."
                        className="input-modern min-h-32"
                        required
                      />
                    </div>
                  </div>

                  {/* Materials */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-blue-600 flex items-center gap-2">
                        📦 Materials & Parts
                      </h3>
                      <button
                        type="button"
                        onClick={addMaterial}
                        className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 font-semibold"
                      >
                        <Plus size={16} /> Add Material
                      </button>
                    </div>
                    <div className="space-y-3 bg-blue-50 p-6 rounded-lg border border-blue-200">
                      {materials.map((material, index) => (
                        <div key={index} className="flex gap-3 items-end">
                          <div className="flex-1">
                            <label className="block text-xs font-semibold text-muted-foreground mb-1">Description</label>
                            <input
                              type="text"
                              value={material.description}
                              onChange={(e) => handleMaterialChange(index, 'description', e.target.value)}
                              placeholder="e.g., Guitar string set"
                              className="input-modern text-sm"
                            />
                          </div>
                          <div className="w-20">
                            <label className="block text-xs font-semibold text-muted-foreground mb-1">Qty</label>
                            <input
                              type="number"
                              min="1"
                              value={material.quantity}
                              onChange={(e) => handleMaterialChange(index, 'quantity', e.target.value)}
                              className="input-modern text-sm text-center"
                            />
                          </div>
                          <div className="w-24">
                            <label className="block text-xs font-semibold text-muted-foreground mb-1">Unit Cost</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={material.unitCost}
                              onChange={(e) => handleMaterialChange(index, 'unitCost', e.target.value)}
                              className="input-modern text-sm"
                              placeholder="0.00"
                            />
                          </div>
                          {materials.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeMaterial(index)}
                              className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                            >
                              <Trash2 size={18} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Labor */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-purple-600 flex items-center gap-2">
                      ⏱️ Labor
                    </h3>
                    <div className="grid grid-cols-2 gap-6 bg-purple-50 p-6 rounded-lg border border-purple-200">
                      <div>
                        <label className="block text-sm font-semibold text-foreground mb-2">Labor Hours</label>
                        <input
                          type="number"
                          name="laborHours"
                          min="0.5"
                          step="0.5"
                          value={formData.laborHours}
                          onChange={handleFormChange}
                          className="input-modern"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-foreground mb-2">Hourly Rate</label>
                        <input
                          type="number"
                          name="hourlyRate"
                          min="0"
                          step="5"
                          value={formData.hourlyRate}
                          onChange={handleFormChange}
                          className="input-modern"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-slate-600">📝 Additional Notes</h3>
                    <textarea
                      name="notes"
                      value={formData.notes}
                      onChange={handleFormChange}
                      placeholder="Any additional information or warranty notes..."
                      className="input-modern min-h-20"
                    />
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    className="w-full bg-gradient-to-r from-primary to-accent text-white font-bold py-4 rounded-lg hover:shadow-lg transition-all duration-300 text-lg"
                  >
                    <Download className="inline mr-2" size={20} />
                    Create Invoice & Download PDF
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Summary Section */}
          <div className="lg:col-span-1">
            <div className="card-modern p-8 sticky top-24">
              <h3 className="text-xl font-display font-bold text-foreground mb-6">Summary</h3>

              <div className="space-y-4 mb-8">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Materials:</span>
                  <span className="font-semibold text-foreground">${totals.materialsTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Labor ({formData.laborHours}h @ ${formData.hourlyRate}/h):</span>
                  <span className="font-semibold text-foreground">${totals.laborTotal.toFixed(2)}</span>
                </div>
                <div className="border-t border-border pt-4 flex justify-between items-center">
                  <span className="text-muted-foreground">Subtotal:</span>
                  <span className="font-semibold text-foreground">${totals.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Tax (8%):</span>
                  <span className="font-semibold text-foreground">${totals.tax.toFixed(2)}</span>
                </div>
                <div className="border-t border-border pt-4 flex justify-between items-center">
                  <span className="text-lg font-semibold text-foreground">Total:</span>
                  <span className="text-2xl font-bold text-primary">${totals.total.toFixed(2)}</span>
                </div>
              </div>

              {showForm && (
                <>
                  <button
                    onClick={() => exportAllInvoicesToCSV()}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2 rounded-lg transition-colors mb-3 flex items-center justify-center gap-2"
                  >
                    <Download size={18} />
                    Export All to CSV
                  </button>

                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm">
                    <p className="font-semibold text-amber-900 mb-2">💾 Invoices Saved</p>
                    <p className="text-amber-800">{savedInvoices.length} invoice(s) stored locally</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Saved Invoices Section */}
        {showInvoices && savedInvoices.length > 0 && (
          <div className="mt-12">
            <div className="card-modern p-8">
              <h2 className="text-3xl font-display font-bold text-foreground mb-6">📋 Saved Invoices</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-primary">
                      <th className="text-left py-3 px-4 font-semibold text-foreground">Invoice #</th>
                      <th className="text-left py-3 px-4 font-semibold text-foreground">Date</th>
                      <th className="text-left py-3 px-4 font-semibold text-foreground">Customer</th>
                      <th className="text-left py-3 px-4 font-semibold text-foreground">Instrument</th>
                      <th className="text-right py-3 px-4 font-semibold text-foreground">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {savedInvoices.map((invoice, idx) => {
                      const matTotal = invoice.materials.reduce((sum, mat) => sum + (mat.quantity * mat.unitCost), 0);
                      const labTotal = invoice.laborHours * invoice.hourlyRate;
                      const total = (matTotal + labTotal) * 1.08;
                      return (
                        <tr key={idx} className="border-b border-border hover:bg-muted/50 transition-colors">
                          <td className="py-3 px-4 font-semibold text-primary">{invoice.invoiceNumber}</td>
                          <td className="py-3 px-4 text-sm text-muted-foreground">{new Date(invoice.date).toLocaleDateString()}</td>
                          <td className="py-3 px-4 text-foreground">{invoice.customerName}</td>
                          <td className="py-3 px-4 text-foreground">{invoice.instrumentType}</td>
                          <td className="py-3 px-4 text-right font-bold text-primary">${total.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
