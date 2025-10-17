/**
 * Matrix Pricing Parser
 * Converts manufacturer pricing matrix CSVs to range-based pricing format
 * 
 * Matrix format example:
 * Height,7',8',9',10'
 * 4',"3,398","3,512","3,587"
 * 5',"3,542","3,661","3,740"
 * 
 * Converts to range format:
 * lengthMin, lengthMax, widthMin, widthMax, retailPrice
 */

interface MatrixEntry {
  lengthMin: number;
  lengthMax: number;
  widthMin: number;
  widthMax: number;
  retailPrice: number;
  basePrice: number;
}

interface ParsedMatrix {
  entries: MatrixEntry[];
  detectedUnit: 'feet' | 'inches' | 'meters';
}

/**
 * Parses a numeric value with optional unit suffix (e.g., "7'", "12\"", "2.5m")
 * Returns value in the original unit without conversion
 */
function parseNumericValue(value: string): { value: number; unit: 'feet' | 'inches' | 'meters' | null } {
  const cleaned = value.trim().replace(/,/g, '');
  
  // Check for unit indicators
  if (cleaned.includes("'") || cleaned.toLowerCase().includes('ft')) {
    return { value: parseFloat(cleaned), unit: 'feet' };
  } else if (cleaned.includes('"') || cleaned.toLowerCase().includes('in')) {
    return { value: parseFloat(cleaned), unit: 'inches' };
  } else if (cleaned.toLowerCase().includes('m')) {
    return { value: parseFloat(cleaned), unit: 'meters' };
  }
  
  // No unit found, return just the number
  const num = parseFloat(cleaned);
  return { value: isNaN(num) ? 0 : num, unit: null };
}

/**
 * Detects if a CSV row appears to be in matrix format
 * Matrix format has numeric/dimension values in first row and first column
 */
export function isMatrixFormat(rows: string[][]): boolean {
  if (rows.length < 3) return false; // Need at least header + 2 data rows
  
  const headerRow = rows[0];
  if (headerRow.length < 3) return false; // Need at least label + 2 columns
  
  // Check if header row (skipping first cell) contains dimension values
  const headerValues = headerRow.slice(1);
  const hasNumericHeaders = headerValues.some(val => {
    const parsed = parseNumericValue(val);
    return parsed.value > 0;
  });
  
  // Check if first column (skipping first cell) contains dimension values
  const firstColumnValues = rows.slice(1).map(row => row[0]);
  const hasNumericFirstColumn = firstColumnValues.some(val => {
    const parsed = parseNumericValue(val);
    return parsed.value > 0;
  });
  
  return hasNumericHeaders && hasNumericFirstColumn;
}

/**
 * Parses a matrix format CSV and converts to range-based pricing entries
 * Automatically detects units and creates ranges between consecutive values
 */
export function parseMatrixCSV(rows: string[][]): ParsedMatrix {
  if (!isMatrixFormat(rows)) {
    throw new Error("CSV is not in matrix format");
  }
  
  const headerRow = rows[0];
  const dataRows = rows.slice(1);
  
  // Parse header dimension values (columns)
  const headerDimensions: number[] = [];
  let detectedUnit: 'feet' | 'inches' | 'meters' = 'feet';
  
  for (let i = 1; i < headerRow.length; i++) {
    const parsed = parseNumericValue(headerRow[i]);
    if (parsed.value > 0) {
      headerDimensions.push(parsed.value);
      if (parsed.unit) {
        detectedUnit = parsed.unit;
      }
    }
  }
  
  // Parse first column dimension values (rows)
  const rowDimensions: number[] = [];
  dataRows.forEach(row => {
    const parsed = parseNumericValue(row[0]);
    if (parsed.value > 0) {
      rowDimensions.push(parsed.value);
    }
  });
  
  // Sort dimensions to ensure proper ordering
  headerDimensions.sort((a, b) => a - b);
  rowDimensions.sort((a, b) => a - b);
  
  // Generate pricing entries with ranges
  const entries: MatrixEntry[] = [];
  
  for (let rowIndex = 0; rowIndex < rowDimensions.length; rowIndex++) {
    const widthValue = rowDimensions[rowIndex];
    const widthMin = widthValue;
    // Calculate max as midpoint to next value, or add reasonable increment for last value
    const widthMax = rowIndex < rowDimensions.length - 1 
      ? (widthValue + rowDimensions[rowIndex + 1]) / 2
      : widthValue + (rowDimensions[rowIndex] - rowDimensions[rowIndex - 1] || 1);
    
    for (let colIndex = 0; colIndex < headerDimensions.length; colIndex++) {
      const lengthValue = headerDimensions[colIndex];
      const lengthMin = lengthValue;
      // Calculate max as midpoint to next value, or add reasonable increment for last value
      const lengthMax = colIndex < headerDimensions.length - 1
        ? (lengthValue + headerDimensions[colIndex + 1]) / 2
        : lengthValue + (headerDimensions[colIndex] - headerDimensions[colIndex - 1] || 1);
      
      // Find corresponding price in matrix
      const dataRow = dataRows.find(row => {
        const parsed = parseNumericValue(row[0]);
        return Math.abs(parsed.value - widthValue) < 0.01;
      });
      
      if (dataRow && dataRow[colIndex + 1]) {
        const priceStr = dataRow[colIndex + 1].replace(/,/g, '').trim();
        const retailPrice = parseFloat(priceStr);
        
        if (!isNaN(retailPrice) && retailPrice > 0) {
          entries.push({
            lengthMin,
            lengthMax,
            widthMin,
            widthMax,
            retailPrice,
            basePrice: retailPrice // Default basePrice to retailPrice
          });
        }
      }
    }
  }
  
  return {
    entries,
    detectedUnit
  };
}

/**
 * Alternative range calculation: Creates discrete ranges
 * Each dimension value gets its own exclusive range (e.g., 7' = 7.0-7.99')
 */
export function parseMatrixCSVWithDiscreteRanges(rows: string[][]): ParsedMatrix {
  if (!isMatrixFormat(rows)) {
    throw new Error("CSV is not in matrix format");
  }
  
  const headerRow = rows[0];
  const dataRows = rows.slice(1);
  
  // Parse header dimension values (columns)
  const headerDimensions: number[] = [];
  let detectedUnit: 'feet' | 'inches' | 'meters' = 'feet';
  
  for (let i = 1; i < headerRow.length; i++) {
    const parsed = parseNumericValue(headerRow[i]);
    if (parsed.value > 0) {
      headerDimensions.push(parsed.value);
      if (parsed.unit) {
        detectedUnit = parsed.unit;
      }
    }
  }
  
  // Parse first column dimension values (rows)
  const rowDimensions: number[] = [];
  dataRows.forEach(row => {
    const parsed = parseNumericValue(row[0]);
    if (parsed.value > 0) {
      rowDimensions.push(parsed.value);
    }
  });
  
  // Sort dimensions
  headerDimensions.sort((a, b) => a - b);
  rowDimensions.sort((a, b) => a - b);
  
  // Generate pricing entries with discrete ranges
  const entries: MatrixEntry[] = [];
  const increment = 0.99; // For discrete ranges (e.g., 7.0-7.99)
  
  for (let rowIndex = 0; rowIndex < rowDimensions.length; rowIndex++) {
    const widthValue = rowDimensions[rowIndex];
    
    for (let colIndex = 0; colIndex < headerDimensions.length; colIndex++) {
      const lengthValue = headerDimensions[colIndex];
      
      // Find corresponding price in matrix
      const dataRow = dataRows.find(row => {
        const parsed = parseNumericValue(row[0]);
        return Math.abs(parsed.value - widthValue) < 0.01;
      });
      
      if (dataRow && dataRow[colIndex + 1]) {
        const priceStr = dataRow[colIndex + 1].replace(/,/g, '').trim();
        const retailPrice = parseFloat(priceStr);
        
        if (!isNaN(retailPrice) && retailPrice > 0) {
          entries.push({
            lengthMin: lengthValue,
            lengthMax: lengthValue + increment,
            widthMin: widthValue,
            widthMax: widthValue + increment,
            retailPrice,
            basePrice: retailPrice
          });
        }
      }
    }
  }
  
  return {
    entries,
    detectedUnit
  };
}
