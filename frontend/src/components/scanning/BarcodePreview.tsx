import { useMemo } from 'react';
import { toSVG } from 'bwip-js/generic';
import { svgPreviewDataUri } from '../../core/scanning/svgPreview';

export type BarcodePreviewType = 'qr' | 'code128' | 'gs1-128' | 'datamatrix';

interface BarcodePreviewProps {
  type: BarcodePreviewType;
  value: string;
  label: string;
  emptyText: string;
  errorText: string;
}

const bwipType: Record<BarcodePreviewType, string> = {
  qr: 'qrcode',
  code128: 'code128',
  'gs1-128': 'gs1-128',
  datamatrix: 'datamatrix',
};

export function BarcodePreview({ type, value, label, emptyText, errorText }: BarcodePreviewProps) {
  const result = useMemo(() => {
    const text = value.trim();
    if (!text) {
      return { svg: '', error: '' };
    }

    try {
      return {
        svg: toSVG({
          bcid: bwipType[type],
          text,
          scale: 2,
          includetext: type === 'code128' || type === 'gs1-128',
          textxalign: 'center',
          paddingwidth: 6,
          paddingheight: 6,
        }),
        error: '',
      };
    } catch (error) {
      return {
        svg: '',
        error: error instanceof Error ? error.message : errorText,
      };
    }
  }, [type, value]);

  return (
    <article className="barcode-preview">
      <span>{label}</span>
      {result.svg ? (
        <div className="barcode-preview__canvas">
          <img src={svgPreviewDataUri(result.svg)} alt={label} />
        </div>
      ) : (
        <p>{result.error || emptyText}</p>
      )}
    </article>
  );
}
