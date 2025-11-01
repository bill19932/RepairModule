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
import { useEffect, useState, useRef } from "react";

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

  const [lastAssignedInvoiceNumber, setLastAssignedInvoiceNumber] =
    useState<number>(() => {
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
    isNoDeliveryFee: false as boolean,
    notes: "" as string,
  });

  const [instruments, setInstruments] = useState([
    { type: "", description: "" },
  ]);
  const [materials, setMaterials] = useState<RepairMaterial[]>([
    { description: "", quantity: 1, unitCost: 0 },
  ]);

  const [savedInvoices, setSavedInvoices] = useState<RepairInvoice[]>(() => {
    const invoices = getAllInvoicesFromLocalStorage();
    localStorage.setItem("delco-invoices", JSON.stringify(invoices));
    return invoices;
  });
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [deliveryMiles, setDeliveryMiles] = useState<number | null>(null);
  const [deliveryFee, setDeliveryFee] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOldRepairFormat, setIsOldRepairFormat] = useState(false);

  // Bulk upload state for multiple repair images -> creates separate repair tickets
  const [batchRepairs, setBatchRepairs] = useState<any[]>([]);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const batchContainerRef = useRef<HTMLDivElement | null>(null);

  const alert = useAlert();

  const scrollBatch = (dir: "left" | "right") => {
    if (!batchContainerRef.current) return;
    const el = batchContainerRef.current;
    const amount = el.clientWidth * 0.6;
    el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setIsProcessingBatch(true);
    const results: any[] = [];

    for (const file of files) {
      try {
        const extracted = await extractInvoiceData(file);
        const preview = URL.createObjectURL(file);
        results.push({
          id:
            typeof crypto !== "undefined" && (crypto as any).randomUUID
              ? (crypto as any).randomUUID()
              : String(Date.now()) + Math.random(),
          fileName: file.name,
          preview,
          extracted,
          saved: false,
        });
      } catch (err) {
        results.push({ id: String(Date.now()) + Math.random(), fileName: file.name, preview: "", extracted: null, error: String(err) });
      }
    }

    setBatchRepairs((prev) => [...prev, ...results]);
    setIsProcessingBatch(false);
    e.target.value = "";
  };

  const loadBatchIntoForm = async (item: any) => {
    if (!item || !item.extracted) return;
    const extracted = item.extracted;

    setFormData((prev) => ({
      ...prev,
      invoiceNumber: extracted.invoiceNumber || prev.invoiceNumber,
      dateReceived: extracted.dateReceived || prev.dateReceived,
      customerName: extracted.customerName || prev.customerName,
      customerPhone: extracted.customerPhone || prev.customerPhone,
      customerEmail: extracted.customerEmail || prev.customerEmail,
      customerAddress: extracted.customerAddress || prev.customerAddress,
      repairDescription: extracted.repairDescription || prev.repairDescription,
    }));

    if (extracted.instruments && extracted.instruments.length > 0) setInstruments(extracted.instruments);
    if (extracted.materials && extracted.materials.length > 0) setMaterials(extracted.materials);

    if (extracted.customerAddress) await calculateDeliveryFee(extracted.customerAddress);

    alert.show("Loaded repair into form", "success");
  };

  const saveBatchItemAsInvoice = (itemIndex: number) => {
    const item = batchRepairs[itemIndex];
    if (!item || !item.extracted) return;
    const extracted = item.extracted;

    const assignedNum = lastAssignedInvoiceNumber + 1;

    const invoice = {
      invoiceNumber: String(assignedNum),
      dateReceived: extracted.dateReceived || new Date().toISOString().split("T")[0],
      date: extracted.date || new Date().toISOString().split("T")[0],
      customerName: extracted.customerName || "",
      customerPhone: extracted.customerPhone || "",
      customerEmail: extracted.customerEmail || "",
      customerAddress: extracted.customerAddress || "",
      deliveryMiles: extracted.deliveryMiles || 0,
      deliveryFee: extracted.deliveryFee || 0,
      instruments: extracted.instruments || [{ type: "", description: "" }],
      repairDescription: extracted.repairDescription || "",
      materials: extracted.materials || [],
      laborHours: 0,
      hourlyRate: 0,
      notes: extracted.notes || "",
      isGeorgesMusic: extracted.isGeorgesMusic || false,
      isNoDeliveryFee: extracted.isNoDeliveryFee || false,
      invoiceHtml: "",
    } as any;

    addInvoiceToLocalStorage(invoice);
    setSavedInvoices(getAllInvoicesFromLocalStorage());
    setLastAssignedInvoiceNumber((prev) => prev + 1);

    // mark saved
    setBatchRepairs((prev) => prev.map((b, i) => (i === itemIndex ? { ...b, saved: true } : b)));
    alert.show(`Saved invoice ${invoice.invoiceNumber}`, "success");
  };

  const saveAllBatch = () => {
    batchRepairs.forEach((_, i) => {
      const b = batchRepairs[i];
      if (!b || b.saved || !b.extracted) return;
      saveBatchItemAsInvoice(i);
    });
  };

  const removeBatchItem = (index: number) => {
    const item = batchRepairs[index];
    if (item && item.preview) URL.revokeObjectURL(item.preview);
    setBatchRepairs((prev) => prev.filter((_, i) => i !== index));
  };

  // Initialize lastAssignedInvoiceNumber, load invoices, and sync across tabs
  useEffect(() => {
    const invoices = getAllInvoicesFromLocalStorage();

    const numericInvoiceNumbers = invoices
      .map((inv) =>
        parseInt(String(inv.invoiceNumber).replace(/[^0-9]/g, ""), 10),
      )
      .filter((n) => !isNaN(n) && n > 0);
    const maxFromSaved =
      numericInvoiceNumbers.length > 0 ? Math.max(...numericInvoiceNumbers) : 0;

    const storedVal =
      parseInt(localStorage.getItem("lastAssignedInvoiceNumber") || "0", 10) ||
      0;
    const defaultStart = 33757;

    if (invoices.length === 0 && storedVal > defaultStart) {
      setLastAssignedInvoiceNumber(defaultStart);
      localStorage.setItem("lastAssignedInvoiceNumber", String(defaultStart));
    } else {
      if (maxFromSaved > storedVal) {
        setLastAssignedInvoiceNumber(maxFromSaved);
        localStorage.setItem("lastAssignedInvoiceNumber", String(maxFromSaved));
      } else if (storedVal === 0) {
        setLastAssignedInvoiceNumber(defaultStart);
        localStorage.setItem("lastAssignedInvoiceNumber", String(defaultStart));
      } else {
        setLastAssignedInvoiceNumber(storedVal);
      }
    }

    const handleFocus = () =>
      setSavedInvoices(getAllInvoicesFromLocalStorage());
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "delco-invoices")
        setSavedInvoices(getAllInvoicesFromLocalStorage());
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  useEffect(() => {
    const next = lastAssignedInvoiceNumber + 1;
    setFormData((prev) => ({ ...prev, invoiceNumber: String(next) }));
  }, [lastAssignedInvoiceNumber]);

  const calculateDeliveryFee = async (address: string) => {
    if (!address || !address.trim() || formData.isGeorgesMusic || formData.isNoDeliveryFee) {
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

      let customerCoords = null;
      const addressVariations: string[] = [];

      addressVariations.push(cleanAddr);
      if (!cleanAddr.includes("Pennsylvania")) {
        addressVariations.push(cleanAddr.replace(/,\s*PA\b/, ", Pennsylvania"));
      }

      for (const variation of addressVariations) {
        customerCoords = await geocodeAddress(variation);
        if (customerCoords) break;
      }

      if (!customerCoords) {
        setDeliveryMiles(null);
        setDeliveryFee(0);
        return;
      }

      const baseCoords = await geocodeAddress(
        "150 E Wynnewood Rd, Wynnewood, PA",
      );
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
      const fee = roundedMiles * 2 * 0.85;
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
      if (
        BILL_PHONE_NUMBERS.some((p) => p.replace(/\D/g, "") === phoneDigitsOnly)
      ) {
        phone = "";
      }

      if (BILL_EMAILS.includes(email.toLowerCase())) {
        email = "";
      }

      // Detect if this is an old repair format
      const isOldFormat = extracted.isOldRepairFormat || false;
      setIsOldRepairFormat(isOldFormat);

      setFormData((prev) => ({
        ...prev,
        invoiceNumber: extracted.invoiceNumber || prev.invoiceNumber,
        dateReceived: extracted.dateReceived || prev.dateReceived,
        customerName: extracted.customerName || prev.customerName,
        customerPhone: phone || prev.customerPhone,
        customerEmail: email || prev.customerEmail,
        customerAddress: extracted.customerAddress || prev.customerAddress,
        repairDescription:
          extracted.repairDescription || prev.repairDescription,
        // Don't set isGeorgesMusic if it's an old repair format
        isGeorgesMusic: isOldFormat ? false : prev.isGeorgesMusic,
      }));

      if (extracted.instruments && extracted.instruments.length > 0) {
        setInstruments(extracted.instruments);
      }

      if (extracted.materials && extracted.materials.length > 0) {
        console.log("[OCR HANDLER] Setting materials:", extracted.materials);
        setMaterials(extracted.materials);
      } else {
        console.log(
          "[OCR HANDLER] No materials extracted:",
          extracted.materials,
        );
      }

      if (extracted.customerAddress) {
        await calculateDeliveryFee(extracted.customerAddress);
      }

      setOcrProgress(100);
      setTimeout(() => {
        alert.show(
          "Invoice data extracted successfully! Please review and adjust as needed.",
          "success",
        );
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

    if (name === "customerAddress") {
      calculateDeliveryFee(value);
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

    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
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

      const parsed = parseInt(
        String(formData.invoiceNumber).replace(/[^0-9]/g, ""),
        10,
      );
      const assignedNum =
        !isNaN(parsed) && parsed > 0 ? parsed : lastAssignedInvoiceNumber + 1;

      const invoice: RepairInvoice = {
        ...formData,
        invoiceNumber: String(assignedNum),
        instruments: instruments.filter((i) => i.type.trim()),
        materials: materials.filter((m) => m.description.trim()),
        deliveryMiles: deliveryMiles ?? 0,
        deliveryFee: formData.isGeorgesMusic ? 0 : deliveryFee || 0,
        invoiceHtml: "",
      };

      // Only update invoice counter if this is NOT an old repair format
      if (!isOldRepairFormat) {
        setLastAssignedInvoiceNumber(assignedNum);
        localStorage.setItem("lastAssignedInvoiceNumber", String(assignedNum));
      }

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
      setSavedInvoices(getAllInvoicesFromLocalStorage());

      try {
        downloadInvoicePDF(invoice);
      } catch (err) {
        console.error("Download/print error:", err);
      }

      // Calculate next invoice number
      const nextInvoiceNum = isOldRepairFormat
        ? lastAssignedInvoiceNumber + 1
        : assignedNum + 1;

      setFormData({
        invoiceNumber: String(nextInvoiceNum),
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
        isNoDeliveryFee: false,
        notes: "",
      });

      setInstruments([{ type: "", description: "" }]);
      setMaterials([{ description: "", quantity: 1, unitCost: 0 }]);
      setDeliveryMiles(null);
      setDeliveryFee(0);
      setIsOldRepairFormat(false);
      alert.show("Invoice created and saved! PDF ready to print.", "success");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteInvoice = (invoiceNumber: string) => {
    const updatedInvoices = savedInvoices.filter(
      (inv) => inv.invoiceNumber !== invoiceNumber,
    );
    setSavedInvoices(updatedInvoices);
    localStorage.setItem("delco-invoices", JSON.stringify(updatedInvoices));

    const parsed = parseInt(String(invoiceNumber).replace(/[^0-9]/g, ""), 10);
    if (!isNaN(parsed) && parsed === lastAssignedInvoiceNumber) {
      const newLast = Math.max(0, lastAssignedInvoiceNumber - 1);
      setLastAssignedInvoiceNumber(newLast);
      localStorage.setItem("lastAssignedInvoiceNumber", String(newLast));
    }

    alert.show("Repair deleted successfully.", "success");
  };

  const calculateTotals = () => {
    const servicesTotal = materials.reduce(
      (sum, mat) => sum + mat.quantity * mat.unitCost,
      0,
    );
    const subtotal = servicesTotal;

    const deliveryAmount = formData.isGeorgesMusic || formData.isNoDeliveryFee ? 0 : deliveryFee || 0;
    const subtotalWithDelivery = subtotal + deliveryAmount;
    const tax = subtotalWithDelivery * 0.06;
    const total = subtotalWithDelivery + tax;

    // George's: upcharge applied AFTER tax on your charge
    const yourTax = subtotal * 0.06;
    const yourChargeWithTax = subtotal + yourTax;
    const georgesSubtotal = yourChargeWithTax * 1.54;
    const georgesTax = 0; // Tax already included in the 1.54 multiplier
    const georgesTotal = georgesSubtotal;

    return {
      servicesTotal,
      subtotal,
      delivery: deliveryAmount,
      tax,
      total,
      yourTax,
      yourChargeWithTax,
      georgesSubtotal,
      georgesTax,
      georgesTotal,
    };
  };

  const totals = calculateTotals();

  return (
    <div className="min-h-screen bg-gray-50">
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
                <div className="text-xl font-bold text-primary">
                  Delco Music Co
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Repair Invoice Manager
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowForm(!showForm)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-foreground font-semibold rounded-sm transition-colors text-sm"
              >
                {showForm ? "Hide Form" : "Show Form"}
              </button>
              <button
                onClick={() => navigate("/records")}
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
          {showForm && (
            <div className="lg:col-span-2">
              <div className="card-modern p-8">
                <h2 className="text-2xl font-bold text-foreground mb-6">
                  New Invoice
                </h2>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">
                      📸 Auto-Fill from Image
                    </label>
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
                            <Loader
                              className="mx-auto mb-1 animate-spin text-primary"
                              size={18}
                            />
                            <p className="text-xs font-semibold text-foreground">
                              Processing... {ocrProgress}%
                            </p>
                          </>
                        ) : (
                          <>
                            <Upload
                              className="mx-auto mb-1 text-primary group-hover:scale-110 transition-transform"
                              size={18}
                            />
                            <p className="text-xs font-semibold text-foreground">
                              Upload invoice screenshot
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-foreground mb-1">
                        Invoice # *
                      </label>
                      <input
                        type="text"
                        name="invoiceNumber"
                        value={formData.invoiceNumber}
                        onChange={handleFormChange}
                        placeholder="e.g., 33758"
                        className="input-modern text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-foreground mb-1">
                        Date Received
                      </label>
                      <input
                        type="date"
                        name="dateReceived"
                        value={formData.dateReceived}
                        onChange={handleFormChange}
                        className="input-modern text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-foreground mb-1">
                        Invoice Date
                      </label>
                      <input
                        type="date"
                        name="date"
                        value={formData.date}
                        onChange={handleFormChange}
                        className="input-modern text-sm"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-foreground mb-1">
                        Customer Name *
                      </label>
                      <input
                        type="text"
                        name="customerName"
                        value={formData.customerName}
                        onChange={handleFormChange}
                        placeholder="Name"
                        className="input-modern text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-foreground mb-1">
                        Phone
                      </label>
                      <input
                        type="tel"
                        name="customerPhone"
                        value={formData.customerPhone}
                        onChange={handleFormChange}
                        placeholder="Phone"
                        className="input-modern text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-foreground mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        name="customerEmail"
                        value={formData.customerEmail}
                        onChange={handleFormChange}
                        placeholder="Email"
                        className="input-modern text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-foreground mb-1">
                        Address
                      </label>
                      <input
                        type="text"
                        name="customerAddress"
                        value={formData.customerAddress}
                        onChange={handleFormChange}
                        placeholder="Address"
                        className="input-modern text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-foreground mb-1">
                        George's Music Repair?
                      </label>
                      <div className="flex items-center gap-4 mt-2">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            name="isGeorgesMusic"
                            checked={formData.isGeorgesMusic}
                            onChange={handleFormChange}
                            className="w-4 h-4"
                          />
                          <span className="text-xs">Yes, George's Music</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            name="isNoDeliveryFee"
                            checked={formData.isNoDeliveryFee}
                            onChange={handleFormChange}
                            className="w-4 h-4"
                          />
                          <span className="text-xs">No Delivery Fee</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-2">
                      Instruments *
                    </label>
                    <div className="space-y-2">
                      {instruments.map((instrument, index) => (
                        <div
                          key={`instr-${index}`}
                          className="grid grid-cols-4 gap-2"
                        >
                          <select
                            value={instrument.type}
                            onChange={(e) =>
                              handleInstrumentChange(
                                index,
                                "type",
                                e.target.value,
                              )
                            }
                            className="input-modern text-sm"
                          >
                            <option value="">Select Type</option>
                            <option value="Guitar">Guitar</option>
                            <option value="Bass">Bass</option>
                            <option value="Violin">Violin</option>
                            <option value="Cello">Cello</option>
                            <option value="Other">Other</option>
                          </select>
                          <input
                            type="text"
                            placeholder="Description"
                            value={instrument.description}
                            onChange={(e) =>
                              handleInstrumentChange(
                                index,
                                "description",
                                e.target.value,
                              )
                            }
                            className="input-modern col-span-2 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => removeInstrument(index)}
                            className="text-red-600 hover:text-red-900 font-semibold text-sm"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={addInstrument}
                        className="text-xs text-primary font-semibold"
                      >
                        + Add Instrument
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1">
                      Repair Work Description *
                    </label>
                    <textarea
                      name="repairDescription"
                      value={formData.repairDescription}
                      onChange={handleFormChange}
                      placeholder="Describe the repair work"
                      className="input-modern text-sm min-h-24 resize-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-2">
                      Services & Materials
                    </label>
                    <div className="space-y-2">
                      {materials.map((material, index) => (
                        <div
                          key={`mat-${index}`}
                          className="grid grid-cols-4 gap-2"
                        >
                          <input
                            type="text"
                            placeholder="Description"
                            value={material.description}
                            onChange={(e) =>
                              handleMaterialChange(
                                index,
                                "description",
                                e.target.value,
                              )
                            }
                            className="input-modern col-span-2 text-sm"
                          />
                          <input
                            type="number"
                            placeholder="Qty"
                            min="1"
                            value={material.quantity}
                            onChange={(e) =>
                              handleMaterialChange(
                                index,
                                "quantity",
                                e.target.value,
                              )
                            }
                            className="input-modern text-sm"
                          />
                          <input
                            type="number"
                            placeholder="Cost"
                            min="0"
                            step="0.01"
                            value={material.unitCost}
                            onChange={(e) =>
                              handleMaterialChange(
                                index,
                                "unitCost",
                                e.target.value,
                              )
                            }
                            className="input-modern text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => removeMaterial(index)}
                            className="text-red-600 text-xs col-span-4"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={addMaterial}
                        className="text-xs text-primary font-semibold"
                      >
                        + Add Item
                      </button>
                    </div>
                  </div>

                  {deliveryMiles !== null && !formData.isGeorgesMusic && !formData.isNoDeliveryFee && (
                    <div className="bg-blue-50 p-3 rounded border border-blue-200">
                      <div className="flex justify-between text-sm">
                        <span className="font-semibold text-blue-900">
                          Delivery Fee ({deliveryMiles} miles × 2 trips)
                        </span>
                        <span className="font-semibold text-blue-900">
                          ${deliveryFee.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="card-modern p-4 bg-gray-50">
                    <h3 className="text-sm font-semibold mb-3">Summary</h3>
                    <div className="text-sm space-y-1">
                      <div className="flex justify-between">
                        <div>Services</div>
                        <div>${totals.servicesTotal.toFixed(2)}</div>
                      </div>
                      <div className="flex justify-between">
                        <div>Delivery</div>
                        <div>${totals.delivery.toFixed(2)}</div>
                      </div>
                      <div className="flex justify-between">
                        <div>Tax (6%)</div>
                        <div>${totals.tax.toFixed(2)}</div>
                      </div>
                      <div className="flex justify-between font-bold border-t pt-1 mt-1">
                        <div>Total</div>
                        <div>${totals.total.toFixed(2)}</div>
                      </div>

                      {formData.isGeorgesMusic && (
                        <div className="mt-3 p-3 bg-blue-50 rounded border border-blue-200">
                          <div className="text-xs text-blue-900 font-semibold mb-2">
                            George's Music Invoice (1.54x)
                          </div>
                          <div className="text-xs space-y-1">
                            <div className="flex justify-between">
                              <div>Repair Total</div>
                              <div>${totals.subtotal.toFixed(2)}</div>
                            </div>
                            <div className="flex justify-between">
                              <div>6% Tax (on Repair Total)</div>
                              <div>${totals.yourTax.toFixed(2)}</div>
                            </div>
                            <div className="flex justify-between">
                              <div>Repair Total + Tax</div>
                              <div>${totals.yourChargeWithTax.toFixed(2)}</div>
                            </div>
                            <div className="flex justify-between">
                              <div>George's Markup (1.54x)</div>
                              <div>${totals.georgesSubtotal.toFixed(2)}</div>
                            </div>
                            <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                              <div>George's Total</div>
                              <div>${totals.georgesTotal.toFixed(2)}</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-4">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? "Printing & Saving..." : "Print & Save"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <div className="lg:col-span-1">
            <div className="card-modern p-6 space-y-4">
              <div className="pt-3 border-t">
                <h4 className="text-sm font-semibold mb-2">Recent Invoices</h4>
                <div className="max-h-48 overflow-auto space-y-2">
                  {savedInvoices.length === 0 ? (
                    <div className="text-xs text-muted-foreground">
                      No invoices yet
                    </div>
                  ) : (
                    savedInvoices
                      .slice()
                      .reverse()
                      .slice(0, 8)
                      .map((inv) => (
                        <div
                          key={`${inv.invoiceNumber}-${inv.dateReceived}`}
                          className="flex items-center justify-between text-xs bg-gray-50 p-2 rounded border"
                        >
                          <div>
                            <div className="font-semibold">
                              #{inv.invoiceNumber}
                            </div>
                            <div className="text-muted-foreground">
                              {inv.customerName}
                            </div>
                            <div className="text-muted-foreground">
                              {inv.dateReceived}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                try {
                                  downloadInvoicePDF(inv);
                                } catch (e) {
                                  console.error(e);
                                }
                              }}
                              className="text-primary hover:underline text-xs font-semibold"
                            >
                              PDF
                            </button>
                            <button
                              onClick={() =>
                                handleDeleteInvoice(inv.invoiceNumber)
                              }
                              className="text-red-600 hover:text-red-900 text-xs font-semibold"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>

              <div className="pt-3">
                <button
                  onClick={() => exportAllInvoicesToCSV()}
                  className="btn-secondary w-full text-sm"
                >
                  Export CSV
                </button>
              </div>
            </div>
          </div>
        </div>
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
