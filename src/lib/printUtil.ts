/**
 * Prints a single DOM node in isolation, inside a hidden iframe containing
 * only that node's markup plus the app's stylesheets. This avoids the
 * classic "extra blank page" bug that happens when the rest of the page
 * (sidebar, topbar, dashboard content, etc.) is merely hidden with
 * visibility/display CSS — hidden content can still occupy layout height
 * and get paginated into the print job. Printing in a blank document
 * sidesteps that entirely.
 */
export function printNode(node: HTMLElement) {
  const iframe = document.createElement('iframe');
  Object.assign(iframe.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '0',
    height: '0',
    border: '0',
  });
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
  doc.close();

  // Copy the app's stylesheets so Tailwind classes render correctly inside the iframe.
  document.querySelectorAll('link[rel="stylesheet"], style').forEach((el) => {
    doc.head.appendChild(el.cloneNode(true));
  });

  // Let the page's own margin box handle spacing (not body padding) so a
  // borderline-height document doesn't spill onto an extra blank page.
  const baseStyle = doc.createElement('style');
  baseStyle.textContent = `
    @page { margin: 12mm; }
    html, body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  `;
  doc.head.appendChild(baseStyle);

  doc.body.innerHTML = node.outerHTML;

  let cleaned = false;
  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    if (iframe.parentNode) document.body.removeChild(iframe);
  }

  function triggerPrint() {
    // window.print() returns immediately — the actual print rendering happens
    // asynchronously, so the iframe must not be torn down on a short fixed
    // timer (that race is what causes blank/incomplete pages). Wait for the
    // browser's own onafterprint signal, with a generous fallback in case a
    // browser doesn't fire it reliably (e.g. some print-to-file flows).
    iframe.contentWindow!.onafterprint = cleanup;
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(cleanup, 60000);
  }

  // Small delay so the copied stylesheets have finished applying before print.
  setTimeout(triggerPrint, 350);
}
