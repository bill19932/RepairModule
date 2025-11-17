import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RepairInvoice } from "@/lib/invoice-types";
import {
  getAllInvoicesFromLocalStorage,
  downloadCSV,
} from "@/lib/csv-exporter";
import { generateInvoicePDF } from "@/lib/pdf-generator";
import { Trash2, Download, FileText, Search } from "lucide-react";
import { AlertDialog, useAlert } from "@/components/AlertDialog";

export default function Records() {
  const navigate = useNavigate();
  const alert = useAlert();

  const [invoices, setInvoices] = useState<RepairInvoice[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [ownerFilter, setOwnerFilter] = useState<"all" | "dmc" | "georges">(
    "all",
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [amountReceivedEdits, setAmountReceivedEdits] = useState<{
    [key: string]: number | undefined;
  }>({});
  const [sortKey, setSortKey] = useState<
    | "invoice"
    | "dateReceived"
    | "customer"
    | "total"
    | "amountReceived"
    | null
  >(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [rowEdits, setRowEdits] = useState<{
    [invoiceNumber: string]: Partial<RepairInvoice>;
  }>({});

  useEffect(() => {
    const load = () => setInvoices(getAllInvoicesFromLocalStorage());
    load();
    window.addEventListener("focus", load);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "delco-invoices") load();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("focus", load);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    let results = invoices.filter((inv) => {
      if (ownerFilter === "dmc" && inv.isGeorgesMusic) return false;
      if (ownerFilter === "georges" && !inv.isGeorgesMusic) return false;

      if (dateFrom) {
        const from = new Date(dateFrom);
        if (new Date(inv.dateReceived) < from) return false;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        if (new Date(inv.dateReceived) > to) return false;
      }

      if (!q) return true;
      // universal text search across all invoice fields
      const hay = [
        inv.invoiceNumber,
        inv.customerName,
        inv.customerPhone || "",
        inv.customerEmail || "",
        inv.instruments.map((i) => `${i.type} ${i.description}`).join(" "),
        inv.repairDescription,
        inv.notes || "",
        inv.materials
          .map((m) => `${m.description} ${m.quantity} ${m.unitCost}`)
          .join(" "),
        inv.date,
        inv.dateReceived,
      ]
        .join(" ")
        .toLowerCase();

      // match all terms typed (split by whitespace)
      return q.split(/\s+/).every((term) => hay.includes(term));
    });

    // Apply sorting
    if (sortKey) {
      results.sort((a, b) => {
        let aVal: any;
        let bVal: any;

        if (sortKey === "invoice") {
          aVal = a.invoiceNumber;
          bVal = b.invoiceNumber;
        } else if (sortKey === "dateReceived") {
          aVal = new Date(a.dateReceived);
          bVal = new Date(b.dateReceived);
        } else if (sortKey === "customer") {
          aVal = a.customerName;
          bVal = b.customerName;
        } else if (sortKey === "total") {
          const aServicesTotal = a.materials.reduce(
            (sum, mat) => sum + mat.quantity * mat.unitCost,
            0,
          );
          const bServicesTotal = b.materials.reduce(
            (sum, mat) => sum + mat.quantity * mat.unitCost,
            0,
          );
          aVal = a.isGeorgesMusic ? aServicesTotal * 1.54 * 1.06 : aServicesTotal * 1.06;
          bVal = b.isGeorgesMusic ? bServicesTotal * 1.54 * 1.06 : bServicesTotal * 1.06;
        } else if (sortKey === "amountReceived") {
          aVal = a.amountReceived !== undefined ? a.amountReceived : -1;
          bVal = b.amountReceived !== undefined ? b.amountReceived : -1;
        }

        if (typeof aVal === "string") {
          aVal = aVal.toLowerCase();
          bVal = bVal.toLowerCase();
          return sortDirection === "asc"
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal);
        } else {
          return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
        }
      });
    }

    return results;
  }, [invoices, searchQuery, dateFrom, dateTo, ownerFilter, sortKey, sortDirection]);

  const toggleSelect = (invoiceNumber: string) => {
    setSelected((prev) =>
      prev.includes(invoiceNumber)
        ? prev.filter((x) => x !== invoiceNumber)
        : [...prev, invoiceNumber],
    );
  };

  const toggleSelectAll = () => {
    if (selected.length === filtered.length) {
      setSelected([]);
    } else {
      setSelected(filtered.map((i) => i.invoiceNumber));
    }
  };

  const handleHeaderClick = (
    key: "invoice" | "dateReceived" | "customer" | "total" | "amountReceived",
  ) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const renderSortArrow = (
    key: "invoice" | "dateReceived" | "customer" | "total" | "amountReceived",
  ) => {
    if (sortKey !== key) return " ↕";
    return sortDirection === "asc" ? " ↑" : " ↓";
  };

  const handleDelete = (invoiceNumber: string) => {
    const updated = getAllInvoicesFromLocalStorage().filter(
      (inv) => inv.invoiceNumber !== invoiceNumber,
    );
    localStorage.setItem("delco-invoices", JSON.stringify(updated));
    setInvoices(updated);
    setSelected((prev) => prev.filter((x) => x !== invoiceNumber));

    // If the deleted invoice was the last assigned, decrement the counter so the next created invoice can reuse the number
    const parsed = parseInt(String(invoiceNumber).replace(/[^0-9]/g, ""), 10);
    const lastAssignedStored =
      parseInt(localStorage.getItem("lastAssignedInvoiceNumber") || "0", 10) ||
      0;
    if (!isNaN(parsed) && parsed === lastAssignedStored) {
      const newLast = Math.max(0, lastAssignedStored - 1);
      localStorage.setItem("lastAssignedInvoiceNumber", String(newLast));
    }

    alert.show("Repair deleted.", "success");
  };

  const handleExportSelected = () => {
    if (selected.length === 0) {
      alert.show("Select at least one invoice to export.", "warning");
      return;
    }
    const toExport = getAllInvoicesFromLocalStorage().filter((inv) =>
      selected.includes(inv.invoiceNumber),
    );
    if (toExport.length === 0) {
      alert.show("No selected invoices found.", "error");
      return;
    }
    downloadCSV(toExport);
  };

  const handleAmountReceivedChange = (invoiceNumber: string, value: string) => {
    const numValue = value ? parseFloat(value) : undefined;
    const key = `${invoiceNumber}`;
    setAmountReceivedEdits((prev) => ({
      ...prev,
      [key]: numValue,
    }));

    // Update localStorage
    const updated = getAllInvoicesFromLocalStorage().map((inv) =>
      inv.invoiceNumber === invoiceNumber
        ? { ...inv, amountReceived: numValue }
        : inv,
    );
    localStorage.setItem("delco-invoices", JSON.stringify(updated));
    setInvoices(updated);
  };

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
                onClick={() => navigate("/")}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-foreground font-semibold rounded-sm transition-colors text-sm"
              >
                Exit
              </button>
            </div>
          </div>
        </header>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="card-modern p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-foreground">
              📋 All Repairs
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportSelected}
                className="bg-green-600 hover:bg-green-700 text-white font-semibold py-1.5 px-3 rounded-sm flex items-center gap-2 text-xs"
              >
                <Download size={12} /> Export
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-3">
            <div className="md:col-span-2 relative">
              <Search
                className="absolute left-2 top-2 text-muted-foreground"
                size={14}
              />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search"
                className="input-modern h-8 w-full text-xs pl-8 border-2 border-gray-300 rounded"
              />
            </div>
            <div className="flex flex-col items-center">
              <label className="text-xs text-muted-foreground mb-0.5">
                From
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="input-modern text-xs text-center w-full h-8"
              />
            </div>
            <div className="flex flex-col items-center">
              <label className="text-xs text-muted-foreground mb-0.5">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="input-modern text-xs text-center w-full h-8"
              />
            </div>
            <div className="flex flex-col items-center">
              <label className="text-xs text-muted-foreground mb-0.5">
                Location
              </label>
              <select
                value={ownerFilter}
                onChange={(e) => setOwnerFilter(e.target.value as any)}
                className="input-modern text-xs border-2 border-gray-300 rounded text-center w-full h-8"
              >
                <option value="all">All</option>
                <option value="dmc">DMC</option>
                <option value="georges">George's</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b-2 border-primary bg-gray-50">
                  <th className="py-2 px-2 text-left">
                    <input
                      type="checkbox"
                      checked={
                        selected.length === filtered.length &&
                        filtered.length > 0
                      }
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th
                    onClick={() => handleHeaderClick("invoice")}
                    className="text-left py-2 px-2 font-semibold text-foreground whitespace-nowrap cursor-pointer hover:bg-gray-100 transition-colors"
                  >
                    Invoice{renderSortArrow("invoice")}
                  </th>
                  <th
                    onClick={() => handleHeaderClick("dateReceived")}
                    className="text-left py-2 px-2 font-semibold text-foreground whitespace-nowrap cursor-pointer hover:bg-gray-100 transition-colors"
                  >
                    Date Received{renderSortArrow("dateReceived")}
                  </th>
                  <th
                    onClick={() => handleHeaderClick("customer")}
                    className="text-left py-2 px-2 font-semibold text-foreground whitespace-nowrap cursor-pointer hover:bg-gray-100 transition-colors"
                  >
                    Customer{renderSortArrow("customer")}
                  </th>
                  <th className="text-left py-2 px-2 font-semibold text-foreground whitespace-nowrap">
                    Instruments
                  </th>
                  <th className="text-left py-2 px-2 font-semibold text-foreground whitespace-nowrap">
                    Repair
                  </th>
                  <th className="text-center py-2 px-2 font-semibold text-foreground whitespace-nowrap">
                    GM
                  </th>
                  <th
                    onClick={() => handleHeaderClick("total")}
                    className="text-right py-2 px-2 font-semibold text-foreground whitespace-nowrap cursor-pointer hover:bg-gray-100 transition-colors"
                  >
                    Total{renderSortArrow("total")}
                  </th>
                  <th
                    onClick={() => handleHeaderClick("amountReceived")}
                    className="text-right py-2 px-2 font-semibold text-foreground whitespace-nowrap cursor-pointer hover:bg-gray-100 transition-colors"
                  >
                    $ Received{renderSortArrow("amountReceived")}
                  </th>
                  <th className="text-center py-2 px-2 font-semibold text-foreground">
                    Act
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => {
                  const servicesTotal = inv.materials.reduce(
                    (sum, mat) => sum + mat.quantity * mat.unitCost,
                    0,
                  );
                  const dmcTotal = servicesTotal * 1.06;
                  const georgesTotal = servicesTotal * 1.54 * 1.06;
                  const displayTotal = inv.isGeorgesMusic
                    ? georgesTotal
                    : dmcTotal;
                  const amountReceivedValue =
                    amountReceivedEdits[inv.invoiceNumber] !== undefined
                      ? amountReceivedEdits[inv.invoiceNumber]
                      : inv.amountReceived;

                  return (
                    <tr
                      key={`${inv.invoiceNumber}-${inv.dateReceived}`}
                      className={`border-b border-border hover:bg-gray-50 transition-colors ${inv.isGeorgesMusic ? "bg-blue-50" : ""}`}
                    >
                      <td className="py-1.5 px-2">
                        <input
                          type="checkbox"
                          checked={selected.includes(inv.invoiceNumber)}
                          onChange={() => toggleSelect(inv.invoiceNumber)}
                        />
                      </td>
                      <td className="py-1.5 px-2 font-semibold text-primary whitespace-nowrap">
                        <button
                          onClick={() => {
                            const html =
                              inv.invoiceHtml || generateInvoicePDF(inv);
                            const w = window.open("", "_blank");
                            if (w) {
                              w.document.open();
                              w.document.write(html);
                              w.document.close();
                            } else {
                              alert.show(
                                "Unable to open invoice preview. Please allow popups.",
                                "error",
                              );
                            }
                          }}
                          className="underline text-primary font-semibold"
                        >
                          {inv.invoiceNumber}
                        </button>
                      </td>
                      <td className="py-1.5 px-2 text-muted-foreground whitespace-nowrap">
                        {new Date(inv.dateReceived).toLocaleDateString(
                          "en-US",
                          { month: "2-digit", day: "2-digit", year: "2-digit" },
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-foreground whitespace-nowrap">
                        {inv.customerName}
                      </td>
                      <td className="py-1.5 px-2 text-foreground">
                        {inv.instruments
                          .map(
                            (i) =>
                              `${i.type}${i.description ? " (" + i.description + ")" : ""}`,
                          )
                          .join(", ")}
                      </td>
                      <td className="py-1.5 px-2 text-foreground">
                        {inv.repairDescription.substring(0, 30)}
                        {inv.repairDescription.length > 30 ? "..." : ""}
                      </td>
                      <td className="py-1.5 px-2 text-center font-semibold whitespace-nowrap">
                        {inv.isGeorgesMusic ? (
                          <span className="bg-blue-200 text-blue-900 px-1.5 py-0.5 rounded text-xs">
                            GM
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-right font-bold text-primary whitespace-nowrap">
                        ${displayTotal.toFixed(2)}
                      </td>
                      <td className="py-1.5 px-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={
                            amountReceivedValue !== undefined
                              ? amountReceivedValue
                              : ""
                          }
                          onChange={(e) =>
                            handleAmountReceivedChange(
                              inv.invoiceNumber,
                              e.target.value,
                            )
                          }
                          placeholder={`$${dmcTotal.toFixed(2)}`}
                          className="input-modern text-xs w-full text-right h-7"
                        />
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        <button
                          onClick={() => handleDelete(inv.invoiceNumber)}
                          className="text-destructive hover:text-destructive/80 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-primary bg-gray-50 font-bold text-xs">
                  <td colSpan={8} className="py-2 px-2 text-right">
                    Total:
                  </td>
                  <td className="py-2 px-2 text-right text-primary whitespace-nowrap">
                    $
                    {filtered
                      .reduce((sum, inv) => {
                        const amountReceived = inv.amountReceived;
                        const received =
                          amountReceived !== undefined
                            ? amountReceived
                            : (() => {
                                const servicesTotal = inv.materials.reduce(
                                  (mat_sum, mat) =>
                                    mat_sum + mat.quantity * mat.unitCost,
                                  0,
                                );
                                const dmcTotal = servicesTotal * 1.06;
                                return dmcTotal;
                              })();
                        return sum + received;
                      }, 0)
                      .toFixed(2)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
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
