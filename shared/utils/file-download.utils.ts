// shared/utils/file-download.utils.ts
//
// Single shared implementation of "save this Blob to the user's
// downloads folder", used by every module's export flow. Previously
// each module (Vehicles, Trips, Fuel, Expenses, Maintenance)
// duplicated this exact create-anchor/click/revoke sequence inline in
// its own utils file; centralizing it here is part of the Phase 2
// "no duplicated utilities" requirement.

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}