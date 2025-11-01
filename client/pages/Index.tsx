import { useNavigate } from "react-router-dom";
import { RepairInvoice, RepairMaterial } from "@/lib/invoice-types";
import { generateInvoicePDF, downloadInvoicePDF } from "@/lib/pdf-generator";
import {
  addInvoiceToLocalStorage,
  exportAllInvoicesToCSV,
  getAllInvoicesFromLocalStorage,
} from "@/lib/csv-exporter";
import { extractInvoiceData } from "@/lib/ocr-utils";
import { geocodeAddress, haversineMiles } from "@/lib/geocode";
import {
  Download,
  Plus,
  Trash2,
  FileText,
  Upload,
  Loader,
  Search,
} from "lucide-react";
import { AlertDialog, useAlert } from "@/components/AlertDialog";
import { useEffect, useState } from "react";

const BILL_PHONE_NUMBERS = [
  "610-505-6096",
  "6105056096",
  "(610) 505-6096",
  "610.505.6096",
];
const BILL_EMAILS = ["bill@delcomusicco.com", "billbaraldi@gmail.com"];

export default function Index() {
  const [showForm, setShowForm] = useState(true);
  const navigate = useNavigate();

  // Track the last assigned invoice number (numeric). This allows reusing the last number
  // if the most recent invoice is deleted, and ensures each saved invoice increments
  // the counter when appropriate.
  const [lastAssignedInvoiceNumber, setLastAssignedInvoiceNumber] = useState<number>(() => {
    const stored = localStorage.getItem("lastAssignedInvoiceNumber");
    return stored ? parseInt(stored, 10) || 0 : 0;
  });

  const [formData, setFormData] = useState({
    invoiceNumber: "" as string,
    dateReceived: new Date().toISOString().split("T")[0] as string,
    date: new Date().toISOString().split("T")[0] as string,
    customerName: "" as string,
    customerPhone: "" as string,
    customerEmail: "" as string,
    customerAddress: "" as string,
    repairDescription: "" as string,
    laborHours: 0 as number,
    hourlyRate: 0 as number,
    isGeorgesMusic: false as boolean,
  });

  const [instruments, setInstruments] = useState([{ type: "", description: "" }]);
  const [materials, setMaterials] = useState<RepairMaterial[]>([
    { description: "", quantity: 1, unitCost: 0 },
  ]);

  const [savedInvoices, setSavedInvoices] = useState<RepairInvoice[]>(
    getAllInvoicesFromLocalStorage(),
  );
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [deliveryMiles, setDeliveryMiles] = useState<number | null>(null);
  const [deliveryFee, setDeliveryFee] = useState<number>(0);
  const alert = useAlert();

  // Initialize lastAssignedInvoiceNumber from saved invoices if not present
  useEffect(() => {
    const invoices = getAllInvoicesFromLocalStorage();
    const numericInvoiceNumbers = invoices
      .map((inv) => parseInt(String(inv.invoiceNumber).replace(/[^0-9]/g, ""), 10))
      .filter((n) => !isNaN(n) && n > 0);
    const maxFromSaved = numericInvoiceNumbers.length > 0 ? Math.max(...numericInvoiceNumbers) : 0;

    const storedVal = parseInt(localStorage.getItem("lastAssignedInvoiceNumber") || "0", 10) || 0;
    const defaultStart = 33757;

    // If there are no saved invoices but localStorage has a larger counter (from another run),
    // reset to defaultStart to allow next invoice to be defaultStart+1 (33758) — prevents accidental gap.
    if (invoices.length === 0 && storedVal > defaultStart) {
      setLastAssignedInvoiceNumber(defaultStart);
      localStorage.setItem("lastAssignedInvoiceNumber", String(defaultStart));
    } else {
      if (maxFromSaved > lastAssignedInvoiceNumber) {
        setLastAssignedInvoiceNumber(maxFromSaved);
        localStorage.setItem("lastAssignedInvoiceNumber", String(maxFromSaved));
      }

      // If nothing found anywhere, default to 33757 as starting point
      if (maxFromSaved === 0 && lastAssignedInvoiceNumber === 0) {
        setLastAssignedInvoiceNumber(defaultStart);
        localStorage.setItem("lastAssignedInvoiceNumber", String(defaultStart));
      }
    }

    setSavedInvoices(invoices);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prefill the invoice number field with the next number whenever lastAssigned changes
  useEffect(() => {
    const next = lastAssignedInvoiceNumber + 1;
    setFormData((prev) => ({ ...prev, invoiceNumber: String(next) }));
  }, [lastAssignedInvoiceNumber]);

  // Keep saved invoices in sync when returning to this page and across tabs
  useEffect(() => {
    const refresh = () => setSavedInvoices(getAllInvoicesFromLocalStorage());
    refresh();
    window.addEventListener("focus", refresh);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "delco-invoices") refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const handleFormChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const calculateDeliveryFee = async (address: string) => {
    if (!address || !address.trim() || formData.isGeorgesMusic) {
      setDeliveryMiles(null);
      setDeliveryFee(0);
      return;
    }

    try {
      let cleanAddr = address.trim();
      cleanAddr = cleanAddr
        .replace(
          /\b(?:Unit|Apt|Apt\.|Apartment|Suite|Ste|Ste\.|#)\s*[0-9A-Za-z\-]+/gi,
          "",
        )
        .trim();
      cleanAddr = cleanAddr.replace(/\s+/g, " ").replace(/,\s*,/g, ",").trim();

      const addressParts = cleanAddr.split(",").map((p) => p.trim());
      let street = addressParts[0];
      let city = "";
      let state = "PA";

      if (addressParts.length >= 2) {
        city = addressParts[1];
        if (addressParts.length >= 3) {
          state = addressParts[2].replace(/^\D*/, "").trim();
        }
      }

      let customerCoords = null;
      let successfulAddr = "";
      const addressVariations: string[] = [];

      addressVariations.push(cleanAddr);
      if (city && state !== "PA") {
        addressVariations.push(`${street}, ${state}`);
      }
      if (city && state) {
        addressVariations.push(`${city}, ${state}`);
      }
      if (!cleanAddr.includes("Pennsylvania")) {
        addressVariations.push(cleanAddr.replace(/,\s*PA\b/, ", Pennsylvania"));
      }

      for (const variation of addressVariations) {
        customerCoords = await geocodeAddress(variation);
        if (customerCoords) {
          successfulAddr = variation;
          break;
        }
      }

      if (!customerCoords) {
        setDeliveryMiles(null);
        setDeliveryFee(0);
        return;
      }

      const baseCoords = await geocodeAddress("150 E Wynnewood Rd, Wynnewood, PA");
      if (!baseCoords) {
        setDeliveryMiles(null);
        setDeliveryFee(0);
        return;
      }

      const miles = haversineMiles(
        baseCoords.lat,
        baseCoords.lon,
        customerCoords.lat,
        customerCoords.lon,
      );
      const roundedMiles = Math.round(miles);
      const fee = roundedMiles * 2 * 0.85; // formula used previously
      const finalFee = parseFloat(fee.toFixed(2));

      setDeliveryMiles(roundedMiles);
      setDeliveryFee(finalFee);
    } catch (err) {
      console.error("[DELIVERY] Error:", err);
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

      let phone = extracted.customerPhone || "";
      let email = extracted.customerEmail || "";

      const phoneDigitsOnly = phone.replace(/\D/g, "");
      if (BILL_PHONE_NUMBERS.some((p) => p.replace(/\D/g, "") === phoneDigitsOnly)) {
        phone = "";
      }

      if (BILL_EMAILS.includes(email.toLowerCase())) {
        email = "";
      }

      setFormData((prev) => ({
        ...prev,
        invoiceNumber: extracted.invoiceNumber || prev.invoiceNumber,
        dateReceived: extracted.dateReceived || prev.dateReceived,
        customerName: extracted.customerName || prev.customerName,
        customerPhone: phone || prev.customerPhone,
        customerEmail: email || prev.customerEmail,
        customerAddress: extracted.customerAddress || prev.customerAddress,
        repairDescription: extracted.repairDescription || prev.repairDescription,
      }));

      if (extracted.instruments && extracted.instruments.length > 0) {
        setInstruments(extracted.instruments);
      }

      if (extracted.materials && extracted.materials.length > 0) {
        setMaterials(extracted.materials);
      }

      if (extracted.customerAddress) {
        await calculateDeliveryFee(extracted.customerAddress);
      }

      setOcrProgress(100);
      setTimeout(() => {
        alert.show("Invoice data extracted successfully! Please review and adjust as needed.", "success");
        setOcrProgress(0);
      }, 500);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error("OCR Error:", errorMsg);
      alert.show(errorMsg, "error");
      setOcrProgress(0);
    } finally {
      setIsProcessingOCR(false);
      e.target.value = "";
    }
  };

  const handleInstrumentChange = (
    index: number,
    field: "type" | "description",
    value: string,
  ) => {
    const newInstruments = [...instruments];
    newInstruments[index][field] = value;
    setInstruments(newInstruments);
  };

  const addInstrument = () => {
    setInstruments([...instruments, { type: "", description: "" }]);
  };

  const removeInstrument = (index: number) => {
    setInstruments(instruments.filter((_, i) => i !== index));
  };

  const handleMaterialChange = (
    index: number,
    field: keyof RepairMaterial,
    value: string | number,
  ) => {
    const newMaterials = [...materials];
    if (field === "quantity" || field === "unitCost") {
      newMaterials[index][field] = parseFloat(value as string) || 0;
    } else {
      newMaterials[index][field] = value as string;
    }
    setMaterials(newMaterials);
  };

  const addMaterial = () => {
    setMaterials([...materials, { description: "", quantity: 1, unitCost: 0 }]);
  };

  const removeMaterial = (index: number) => {
    setMaterials(materials.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.invoiceNumber) {
      alert.show("Please enter an Invoice Number", "warning");
      return;
    }

    if (
      !formData.customerName ||
      instruments.some((i) => !i.type) ||
      !formData.repairDescription
    ) {
      alert.show(
        "Please fill in: Invoice #, Customer Name, Instrument Type(s), and Repair Description",
        "warning",
      );
      return;
    }

    // Determine assigned invoice number (numeric part). If invoice number isn't numeric, fall back to next counter.
    const parsed = parseInt(String(formData.invoiceNumber).replace(/[^0-9]/g, ""), 10);
    const assignedNum = !isNaN(parsed) && parsed > 0 ? parsed : lastAssignedInvoiceNumber + 1;

    // Prepare invoice object
    const invoice: RepairInvoice = {
      ...formData,
      invoiceNumber: String(assignedNum),
      instruments: instruments.filter((i) => i.type.trim()),
      materials: materials.filter((m) => m.description.trim()),
      deliveryMiles: deliveryMiles ?? 0,
      deliveryFee: formData.isGeorgesMusic ? 0 : deliveryFee || 0,
      invoiceHtml: "",
    };

    // Update lastAssigned so the next invoice increments. Persist the lastAssigned value.
    setLastAssignedInvoiceNumber(assignedNum);
    localStorage.setItem("lastAssignedInvoiceNumber", String(assignedNum));

    let invoiceHtml = "";
    try {
      if (typeof generateInvoicePDF === "function") {
        invoiceHtml = generateInvoicePDF(invoice);
        invoice.invoiceHtml = invoiceHtml;
      } else {
        invoice.invoiceHtml = "";
      }
    } catch (err) {
      console.error("PDF generation error:", err);
      invoice.invoiceHtml = "";
    }

    addInvoiceToLocalStorage(invoice);
    setSavedInvoices((prev) => [...prev, invoice]);

    try {
      downloadInvoicePDF(invoice);
    } catch (err) {
      console.error("Download/print error:", err);
    }

    // Prefill next invoice number (assignedNum + 1)
    setFormData({
      invoiceNumber: String(assignedNum + 1),
      dateReceived: formData.dateReceived,
      date: formData.date,
      customerName: "",
      customerPhone: "",
      customerEmail: "",
      customerAddress: "",
      repairDescription: "",
      laborHours: 0,
      hourlyRate: 0,
      isGeorgesMusic: false,
    });

    setInstruments([{ type: "", description: "" }]);
    setMaterials([{ description: "", quantity: 1, unitCost: 0 }]);
    setDeliveryMiles(null);
    setDeliveryFee(0);
    alert.show("Invoice created and saved! PDF ready to print.", "success");
  };

  const handleDeleteInvoice = (invoiceNumber: string) => {
    const updatedInvoices = savedInvoices.filter((inv) => inv.invoiceNumber !== invoiceNumber);
    setSavedInvoices(updatedInvoices);
    localStorage.setItem("delco-invoices", JSON.stringify(updatedInvoices));

    // If the deleted invoice is the currently last assigned, decrement lastAssigned to allow reuse
    const parsed = parseInt(String(invoiceNumber).replace(/[^0-9]/g, ""), 10);
    if (!isNaN(parsed) && parsed === lastAssignedInvoiceNumber) {
      const newLast = Math.max(0, lastAssignedInvoiceNumber - 1);
      setLastAssignedInvoiceNumber(newLast);
      localStorage.setItem("lastAssignedInvoiceNumber", String(newLast));
    }

    alert.show("Repair deleted successfully.", "success");
  };

  const calculateTotals = () => {
    const servicesTotal = materials.reduce((sum, mat) => sum + mat.quantity * mat.unitCost, 0);
    const subtotal = servicesTotal;

    const deliveryAmount = formData.isGeorgesMusic ? 0 : deliveryFee || 0;
    const subtotalWithDelivery = subtotal + deliveryAmount;
    const tax = subtotalWithDelivery * 0.06;
    const total = subtotalWithDelivery + tax;

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
    return savedInvoices.filter((invoice) =>
      invoice.invoiceNumber.toLowerCase().includes(query) ||
      invoice.customerName.toLowerCase().includes(query) ||
      invoice.customerPhone.toLowerCase().includes(query) ||
      invoice.customerEmail.toLowerCase().includes(query) ||
      invoice.instrumentType.toLowerCase().includes(query) ||
      invoice.instrumentDescription.toLowerCase().includes(query) ||
      invoice.repairDescription.toLowerCase().includes(query) ||
      invoice.date.includes(query),
    );
  };

  const totals = calculateTotals();
  const filteredInvoices = getFilteredInvoices();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Rest of component unchanged - omitted for brevity in this edit block */}
      {/* The file content below this point remains identical to previous implementation */}

      <div className="bg-white border-b border-gray-200">
        <div className="h-1 bg-primary"></div>
        <header className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src="https://cdn.builder.io/api/v1/image/assets%2F99d159038b9d45ab8f72730367c1abf4%2F9753a3ec93ee4d5dba7a86a75c0f457f?format=webp&width=800"
                alt="Delco Music Co"
                className="h-10 object-contain"
              />
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
                {showForm ? "Hide Form" : "Show Form"}
              </button>
              <button onClick={() => navigate("/records")} className="btn-primary flex items-center gap-2">
                <FileText size={16} />
                Records
              </button>
            </div>
          </div>
        </header>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {showForm && (
            <div className="lg:col-span-2">
              <div className="card-modern p-8">
                <h2 className="text-2xl font-bold text-foreground mb-6">New Invoice</h2>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">📸 Auto-Fill from Image</label>
                    <div className="relative border-2 border-dashed border-primary/30 rounded-sm p-6 bg-blue-50 hover:border-primary/50 transition-colors cursor-pointer group">
                      <input type="file" accept="image/*" onChange={handleOCRUpload} disabled={isProcessingOCR} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
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

                  {/* Rest of form remains unchanged (instruments, materials, totals, etc.) */}

                  <div className="pt-4">
                    <button type="submit" className="btn-primary">Save Invoice</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Sidebar summary / totals */}
          <div className="lg:col-span-1">
            <div className="card-modern p-6 space-y-4">
              <h3 className="text-lg font-semibold">Summary</h3>
              <div className="text-sm">
                <div className="flex justify-between"><div>Services</div><div>${totals.servicesTotal.toFixed(2)}</div></div>
                <div className="flex justify-between"><div>Delivery</div><div>${totals.delivery.toFixed(2)}</div></div>
                <div className="flex justify-between"><div>Tax (6%)</div><div>${totals.tax.toFixed(2)}</div></div>
                <div className="flex justify-between font-bold mt-2"><div>Total</div><div>${totals.total.toFixed(2)}</div></div>

                {formData.isGeorgesMusic && (
                  <div className="mt-3 p-3 bg-blue-50 rounded">
                    <div className="text-xs text-blue-900 font-semibold">George's Music Invoice (1.54x)</div>
                    <div className="text-sm mt-1">Your Charge: ${totals.subtotal.toFixed(2)}</div>
                    <div className="text-sm">George's Markup (1.54x): ${totals.georgesSubtotal.toFixed(2)}</div>
                    <div className="text-sm">George's Total (incl. tax): ${totals.georgesTotal.toFixed(2)}</div>
                  </div>
                )}
              </div>

              <div className="pt-3">
                <h4 className="text-sm font-semibold">Recent Invoices</h4>
                <div className="max-h-48 overflow-auto mt-2 space-y-2">
                  {savedInvoices.slice().reverse().slice(0, 8).map((inv) => (
                    <div key={inv.invoiceNumber} className="flex items-center justify-between text-sm border rounded p-2">
                      <div>
                        <div className="font-semibold">#{inv.invoiceNumber}</div>
                        <div className="text-xs text-muted-foreground">{inv.customerName} • {inv.dateReceived}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => { try { downloadInvoicePDF(inv); } catch(e){console.error(e);} }} className="text-primary underline text-xs">PDF</button>
                        <button onClick={() => handleDeleteInvoice(inv.invoiceNumber)} className="text-red-600 text-xs">Delete</button>
                      </div>
                    </div>
                  ))}
                  {savedInvoices.length === 0 && <div className="text-xs text-muted-foreground">No invoices yet</div>}
                </div>
              </div>

              <div className="pt-2">
                <button onClick={() => exportAllInvoicesToCSV()} className="btn-secondary w-full">Export CSV</button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
