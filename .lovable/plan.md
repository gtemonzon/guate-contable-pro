
# Plan: PDF Typography Configuration for Tenants

## Overview
Add a new configuration section in `/configuracion` that allows tenant administrators to customize the typography (font family and size) used when generating PDF reports. This setting will be stored at the tenant level and applied to all PDF exports across the system.

---

## Database Changes

### New Columns in `tab_tenants` Table
Add two new columns to store PDF typography preferences:

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `pdf_font_family` | `text` | `'helvetica'` | Selected font for PDF generation |
| `pdf_font_size` | `integer` | `8` | Base font size for PDF table content |

---

## Available Font Options

Based on jsPDF standard fonts that work without additional setup:

| Font Name | Display Name | Description |
|-----------|--------------|-------------|
| `helvetica` | Helvetica | Sans-serif, modern and clean (Default) |
| `courier` | Courier | Monospace, technical look |
| `times` | Times | Serif, traditional/formal style |

---

## Font Size Options

| Size | Use Case |
|------|----------|
| 6 | Extra small - for dense reports |
| 7 | Very small |
| 8 | Small (Default) - standard table content |
| 9 | Medium-small |
| 10 | Medium |
| 11 | Medium-large |
| 12 | Large - for readability |

---

## New Files to Create

### 1. `src/components/configuracion/PdfTypographyManager.tsx`
New component for the PDF typography configuration panel:

- Card with title "Tipografia de PDFs" and description
- Dropdown to select font family (Helvetica, Courier, Times)
- Dropdown or slider for font size (6-12)
- Live preview showing sample text in selected font/size
- Save button that updates the tenant record
- Only visible to tenant administrators

### 2. `src/hooks/usePdfConfig.ts`
Custom hook to fetch and provide PDF configuration:

- Fetches current tenant's PDF settings
- Returns `{ fontFamily, fontSize }` with defaults
- Caches configuration for performance
- Auto-refreshes when tenant changes

---

## Files to Modify

### 1. `src/pages/Configuracion.tsx`
- Import and add new tab "Tipografia PDFs"
- Add `TabsTrigger` for "pdf-typography"
- Add `TabsContent` with `PdfTypographyManager` component

### 2. `src/utils/reportExport.ts`
- Update `exportToPDF` function to accept optional font configuration
- Apply configured font family using `doc.setFont(fontFamily, style)`
- Apply configured font size for table content
- Maintain proportional sizes (headers larger than content)

### 3. `src/pages/Ayuda.tsx`
- Update PDF export in help section to use tenant font configuration

### 4. `src/contexts/TenantContext.tsx`
- Add `pdf_font_family` and `pdf_font_size` to Tenant interface
- Include these fields in tenant fetch query

---

## Implementation Flow

```text
                                    User Interface
                                         |
                                         v
                          +-----------------------------+
                          |   PdfTypographyManager.tsx  |
                          |   - Font family dropdown    |
                          |   - Font size selector      |
                          |   - Preview panel           |
                          |   - Save button             |
                          +-----------------------------+
                                         |
                                   Save Config
                                         |
                                         v
                          +-----------------------------+
                          |     tab_tenants table       |
                          |   pdf_font_family: text     |
                          |   pdf_font_size: integer    |
                          +-----------------------------+
                                         |
                                    Load Config
                                         |
                                         v
                          +-----------------------------+
                          |    usePdfConfig.ts hook     |
                          |   Returns { fontFamily,     |
                          |             fontSize }      |
                          +-----------------------------+
                                         |
                                   Apply to PDFs
                                         |
                                         v
                          +-----------------------------+
                          |    reportExport.ts          |
                          |   doc.setFont(fontFamily)   |
                          |   doc.setFontSize(size)     |
                          +-----------------------------+
```

---

## UI Design

The configuration panel will include:

1. **Font Family Selector**
   - Label: "Tipo de Fuente"
   - Radio group or Select with visual preview
   - Options show font name with sample text

2. **Font Size Selector**  
   - Label: "Tamano de Fuente"
   - Numeric input or slider (6-12)
   - Description: "Tamano base para contenido de tablas"

3. **Preview Section**
   - Shows sample table row in selected typography
   - Updates in real-time as user changes settings

4. **Access Control**
   - Only tenant administrators can modify these settings
   - Regular users can view but not edit

---

## Technical Details

### Font Application in jsPDF:
```typescript
// Apply font family
doc.setFont(config.fontFamily, 'normal');

// Apply font size (proportional)
const headerSize = config.fontSize + 4;  // Headers larger
const contentSize = config.fontSize;      // Table content
const footerSize = config.fontSize - 1;   // Footers smaller
```

### AutoTable Configuration:
```typescript
autoTable(doc, {
  styles: {
    font: config.fontFamily,
    fontSize: config.fontSize,
  },
  headStyles: {
    fontSize: config.fontSize + 2,
  },
});
```

---

## Summary of Changes

| Area | Change |
|------|--------|
| Database | Add 2 columns to `tab_tenants` |
| New Components | `PdfTypographyManager.tsx`, `usePdfConfig.ts` |
| Modified Files | `Configuracion.tsx`, `reportExport.ts`, `Ayuda.tsx`, `TenantContext.tsx` |
| UI | New tab in configuration page with font/size selectors |
| PDF Generation | Dynamic font application based on tenant settings |
